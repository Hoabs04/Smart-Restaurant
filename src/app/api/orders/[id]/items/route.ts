import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  notes?: string;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderId } = await context.params;
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng cung cấp ít nhất một món ăn cần thêm.' },
        { status: 400 }
      );
    }

    for (const it of items as OrderItemInput[]) {
      if (!it.menu_item_id || !it.quantity || it.quantity <= 0 || !Number.isInteger(it.quantity)) {
        return NextResponse.json(
          { success: false, code: 'INVALID_QUANTITY', message: 'Số lượng món phải là số nguyên lớn hơn 0.' },
          { status: 400 }
        );
      }
    }

    const result = await withTransaction(async (tx) => {
      // 1. Kiểm tra Order có đang mở không
      const order = await tx.queryOne<{
        id: string;
        order_code: string;
        status: string;
        total_amount: number;
        payment_status: string | null;
      }>(
        `SELECT id, order_code, status, total_amount, payment_status
         FROM orders 
         WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!order) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Đơn hàng không tồn tại.' };
      }

      if (order.status === 'CLOSED') {
        throw { code: 'ORDER_ALREADY_CLOSED', message: 'Đơn hàng này đã chốt, không thể thêm món mới.' };
      }

      // 2. Tra cứu món ăn từ Menu
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
      const outOfStockItems: string[] = [];

      for (const it of items as OrderItemInput[]) {
        const itemInfo = menuMap.get(it.menu_item_id);
        if (!itemInfo) {
          throw { code: 'MENU_ITEM_NOT_FOUND', message: `Món ăn có mã ${it.menu_item_id} không tồn tại.` };
        }
        if (!itemInfo.availability || itemInfo.stock_quantity <= 0) {
          outOfStockItems.push(itemInfo.name);
        }
      }

      if (outOfStockItems.length > 0) {
        throw {
          code: 'OUT_OF_STOCK',
          message: `Không thể thêm món: Món [${outOfStockItems.join(', ')}] hiện đã hết hàng.`,
          outOfStockItems,
        };
      }

      // 3. Thêm items với status NEW và tính tổng tiền bổ sung
      let addedAmount = 0;
      const createdItems = [];

      for (const it of items as OrderItemInput[]) {
        const itemInfo = menuMap.get(it.menu_item_id)!;
        const lineTotal = itemInfo.current_price * it.quantity;
        addedAmount += lineTotal;

        const orderItemId = crypto.randomUUID();
        const cleanNotes = typeof it.notes === 'string' && it.notes.trim() ? it.notes.trim().slice(0, 120) : null;
        await tx.execute(
          `INSERT INTO order_items (
            id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, notes, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
          [
            orderItemId,
            orderId,
            itemInfo.id,
            itemInfo.name,
            itemInfo.current_price,
            it.quantity,
            cleanNotes,
          ]
        );

        createdItems.push({
          id: orderItemId,
          itemName: itemInfo.name,
          unitPrice: itemInfo.current_price,
          quantity: it.quantity,
          lineTotal,
          status: 'NEW',
        });
      }

      // Cập nhật lại total_amount, đưa order về status OPEN (nếu cần gửi batch mới),
      // và reset payment_status về PENDING nếu trước đó đã xác nhận thanh toán cho số tiền cũ
      const newTotal = Number(order.total_amount) + addedAmount;
      const newStatus = order.status === 'READY_TO_CLOSE' ? 'OPEN' : order.status;
      const resetPayment = order.payment_status === 'MANUALLY_CONFIRMED';

      await tx.execute(
        `UPDATE orders 
         SET total_amount = $1,
             status = $2,
             payment_status = CASE WHEN $4 THEN 'PENDING' ELSE payment_status END,
             payment_confirmed_at = CASE WHEN $4 THEN NULL ELSE payment_confirmed_at END,
             payment_confirmed_by = CASE WHEN $4 THEN NULL ELSE payment_confirmed_by END,
             payment_reference = CASE WHEN $4 THEN NULL ELSE payment_reference END,
             version = version + 1,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3;`,
        [newTotal, newStatus, orderId, resetPayment]
      );

      // Ghi lịch sử
      const historyNote = resetPayment
        ? 'Thêm món mới vào đơn hàng (tự động đặt lại trạng thái chờ xác nhận thanh toán)'
        : 'Thêm món mới vào đơn hàng';
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6);`,
        [crypto.randomUUID(), orderId, order.status, newStatus, actor.userId, historyNote]
      );

      return {
        orderId,
        orderCode: order.order_code,
        previousTotal: Number(order.total_amount),
        newTotal,
        addedItems: createdItems,
      };
    });

    // Ghi audit log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CREATE_ORDER',
      entityType: 'ORDER',
      entityId: orderId,
      details: {
        addedCount: result.addedItems.length,
        newTotal: result.newTotal,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Đã thêm món mới vào đơn hàng thành công.',
      data: result,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Lỗi API POST /api/orders/[id]/items:', error);
    if (error.code === 'ORDER_NOT_FOUND') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 404 }
      );
    }
    if (error.code === 'OUT_OF_STOCK' || error.code === 'ORDER_ALREADY_CLOSED' || error.code === 'MENU_ITEM_NOT_FOUND') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message, outOfStockItems: error.outOfStockItems },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi thêm món vào đơn hàng.' },
      { status: 500 }
    );
  }
}
