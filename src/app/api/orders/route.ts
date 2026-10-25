import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['waiter']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const body = await req.json();
    const { table_id, items, idempotency_key, expected_table_version } = body;

    if (!table_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng chọn bàn và ít nhất một món ăn.' },
        { status: 400 }
      );
    }

    // Kiểm tra số lượng hợp lệ
    for (const it of items as OrderItemInput[]) {
      if (!it.menu_item_id || !it.quantity || it.quantity <= 0 || !Number.isInteger(it.quantity)) {
        return NextResponse.json(
          { success: false, code: 'INVALID_QUANTITY', message: 'Số lượng món ăn phải là số nguyên dương lớn hơn 0.' },
          { status: 400 }
        );
      }
    }

    const db = await getDb();

    // 1. Kiểm tra idempotency key trước nếu có
    if (idempotency_key) {
      const existingOrderByKey = await db.queryOne<{ id: string; order_code: string; total_amount: number }>(
        `SELECT id, order_code, total_amount FROM orders WHERE idempotency_key = $1;`,
        [idempotency_key]
      );
      if (existingOrderByKey) {
        return NextResponse.json({
          success: true,
          message: 'Yêu cầu đã được xử lý trước đó (Idempotent).',
          order: {
            id: existingOrderByKey.id,
            orderCode: existingOrderByKey.order_code,
            totalAmount: Number(existingOrderByKey.total_amount),
          },
        });
      }
    }

    // 2. Thực hiện tạo đơn hàng trong Transaction nguyên tử
    const result = await withTransaction(async (tx) => {
      // Khóa và kiểm tra bàn ăn
      const table = await tx.queryOne<{
        id: string;
        table_code: string;
        status: string;
        version: number;
        is_active: boolean;
      }>(
        `SELECT id, table_code, status, version, is_active 
         FROM dining_tables 
         WHERE id = $1 FOR UPDATE;`,
        [table_id]
      );

      if (!table || !table.is_active) {
        throw { code: 'TABLE_NOT_FOUND', message: 'Bàn ăn không tồn tại hoặc đã ngừng hoạt động.' };
      }

      // Kiểm tra optimistic locking nếu client gửi expected_table_version
      if (expected_table_version !== undefined && table.version !== expected_table_version) {
        throw {
          code: 'TABLE_CONFLICT',
          message: `Bàn ${table.table_code} vừa được nhân viên khác cập nhật. Vui lòng làm mới để lấy dữ liệu mới nhất.`,
        };
      }

      // Kiểm tra xem bàn đã có đơn hàng nào đang mở không
      const openOrder = await tx.queryOne<{ id: string; order_code: string }>(
        `SELECT id, order_code 
         FROM orders 
         WHERE table_id = $1 AND status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE')
         LIMIT 1;`,
        [table_id]
      );

      if (openOrder) {
        throw {
          code: 'TABLE_ALREADY_OCCUPIED',
          message: `Bàn ${table.table_code} hiện đang có đơn hàng mở (${openOrder.order_code}). Không thể tạo thêm đơn hàng mới trên cùng bàn.`,
          existingOrderId: openOrder.id,
        };
      }

      // 3. Tra cứu danh sách món ăn từ DB (Client không gửi tên và giá!)
      const itemIds = items.map((i: OrderItemInput) => i.menu_item_id);
      const menuRows = await tx.query<{
        id: string;
        name: string;
        current_price: number;
        stock_quantity: number;
        availability: boolean;
      }>(
        `SELECT id, name, current_price, stock_quantity, availability 
         FROM menu_items 
         WHERE id = ANY($1);`,
        [itemIds]
      );

      const menuMap = new Map(menuRows.map(m => [m.id, m]));

      // Kiểm tra món hết hàng hoặc không tồn tại
      const outOfStockItems: string[] = [];
      for (const it of items as OrderItemInput[]) {
        const itemInfo = menuMap.get(it.menu_item_id);
        if (!itemInfo) {
          throw { code: 'MENU_ITEM_NOT_FOUND', message: `Món ăn có mã ${it.menu_item_id} không tồn tại trong hệ thống.` };
        }
        if (!itemInfo.availability || itemInfo.stock_quantity <= 0) {
          outOfStockItems.push(itemInfo.name);
        }
      }

      if (outOfStockItems.length > 0) {
        throw {
          code: 'OUT_OF_STOCK',
          message: `Không thể tạo order: Món [${outOfStockItems.join(', ')}] hiện đã hết hàng. Vui lòng chọn món khác.`,
          outOfStockItems,
        };
      }

      // 4. Tạo Order mới
      const orderId = crypto.randomUUID();
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const orderCode = `ORD-${todayStr}-${randomSuffix}`;

      // Tính tổng tiền đơn hàng trước
      let totalAmount = 0;
      for (const it of items as OrderItemInput[]) {
        const itemInfo = menuMap.get(it.menu_item_id)!;
        totalAmount += itemInfo.current_price * it.quantity;
      }

      // Lưu Order (Bảng cha) trước để thỏa mãn Foreign Key constraint
      await tx.execute(
        `INSERT INTO orders (
          id, order_code, table_id, created_by, status, idempotency_key, total_amount, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
        [orderId, orderCode, table_id, actor.userId, idempotency_key || null, totalAmount]
      );

      // Lưu các món ăn (Bảng con order_items)
      const createdItems = [];
      for (const it of items as OrderItemInput[]) {
        const itemInfo = menuMap.get(it.menu_item_id)!;
        const lineTotal = itemInfo.current_price * it.quantity;
        const orderItemId = crypto.randomUUID();

        await tx.execute(
          `INSERT INTO order_items (
            id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'NEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
          [
            orderItemId,
            orderId,
            itemInfo.id,
            itemInfo.name,
            itemInfo.current_price,
            it.quantity,
          ]
        );

        createdItems.push({
          id: orderItemId,
          menuItemId: itemInfo.id,
          itemName: itemInfo.name,
          unitPrice: itemInfo.current_price,
          quantity: it.quantity,
          status: 'NEW',
          lineTotal,
        });
      }

      // Cập nhật trạng thái bàn sang OCCUPIED và tăng version
      await tx.execute(
        `UPDATE dining_tables 
         SET status = 'OCCUPIED', version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1;`,
        [table_id]
      );

      // Ghi lịch sử trạng thái
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, 'NONE', 'OPEN', $3, CURRENT_TIMESTAMP, 'Tạo đơn hàng mới');`,
        [crypto.randomUUID(), orderId, actor.userId]
      );

      return {
        orderId,
        orderCode,
        tableId: table_id,
        tableCode: table.table_code,
        status: 'OPEN',
        totalAmount,
        items: createdItems,
      };
    });

    // Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CREATE_ORDER',
      entityType: 'ORDER',
      entityId: result.orderId,
      details: {
        orderCode: result.orderCode,
        tableCode: result.tableCode,
        itemCount: result.items.length,
        totalAmount: result.totalAmount,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Tạo đơn hàng thành công.',
      order: result,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Lỗi API POST /api/orders:', error);
    if (error.code === 'TABLE_CONFLICT' || error.code === 'TABLE_ALREADY_OCCUPIED') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message, existingOrderId: error.existingOrderId },
        { status: 409 }
      );
    }
    if (error.code === 'OUT_OF_STOCK' || error.code === 'TABLE_NOT_FOUND' || error.code === 'MENU_ITEM_NOT_FOUND') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message, outOfStockItems: error.outOfStockItems },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi tạo đơn hàng.' },
      { status: 500 }
    );
  }
}
