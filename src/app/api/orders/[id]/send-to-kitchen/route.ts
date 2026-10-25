import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const idempotencyKey = body.idempotency_key || req.headers.get('x-idempotency-key');

    if (!idempotencyKey) {
      return NextResponse.json(
        { success: false, code: 'MISSING_IDEMPOTENCY_KEY', message: 'Yêu cầu gửi bếp bắt buộc phải có idempotency_key để đảm bảo an toàn.' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 1. Kiểm tra Idempotency: Nếu batch này đã được xử lý thành công trước đó
    const existingBatch = await db.queryOne<{
      id: string;
      batch_number: number;
      sent_at: string;
    }>(
      `SELECT id, batch_number, sent_at 
       FROM kitchen_batches 
       WHERE idempotency_key = $1;`,
      [idempotencyKey]
    );

    if (existingBatch) {
      const batchItems = await db.query(
        `SELECT id, item_name_snapshot, quantity, status 
         FROM order_items 
         WHERE kitchen_batch_id = $1;`,
        [existingBatch.id]
      );

      return NextResponse.json({
        success: true,
        message: 'Batch đã được gửi bếp trước đó (Idempotent response - không trừ kho lần hai).',
        isIdempotentReplay: true,
        batch: {
          id: existingBatch.id,
          batchNumber: existingBatch.batch_number,
          sentAt: existingBatch.sent_at,
          items: batchItems,
        },
      });
    }

    // 2. Thực hiện toàn bộ quy trình gửi bếp trong một Transaction nguyên tử
    const result = await withTransaction(async (tx) => {
      // Khóa và kiểm tra Order
      const order = await tx.queryOne<{
        id: string;
        order_code: string;
        status: string;
        table_id: string;
      }>(
        `SELECT id, order_code, status, table_id 
         FROM orders 
         WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!order) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Đơn hàng không tồn tại.' };
      }

      if (order.status === 'CLOSED') {
        throw { code: 'ORDER_ALREADY_CLOSED', message: 'Đơn hàng đã đóng, không thể gửi bếp.' };
      }

      // Lấy danh sách các món đang ở trạng thái NEW
      const newItems = await tx.query<{
        id: string;
        menu_item_id: string;
        item_name_snapshot: string;
        quantity: number;
      }>(
        `SELECT id, menu_item_id, item_name_snapshot, quantity 
         FROM order_items 
         WHERE order_id = $1 AND status = 'NEW' 
         FOR UPDATE;`,
        [orderId]
      );

      if (newItems.length === 0) {
        throw {
          code: 'NO_NEW_ITEMS',
          message: 'Không có món mới nào cần gửi bếp trong đơn hàng này.',
        };
      }

      // Gom tổng số lượng cần trừ theo từng menu_item_id
      const quantityByMenuItem = new Map<string, { totalQty: number; name: string }>();
      for (const item of newItems) {
        const cur = quantityByMenuItem.get(item.menu_item_id) || { totalQty: 0, name: item.item_name_snapshot };
        cur.totalQty += item.quantity;
        quantityByMenuItem.set(item.menu_item_id, cur);
      }

      const menuItemIds = Array.from(quantityByMenuItem.keys());

      // Khóa và kiểm tra tồn kho các món ăn trong kho bằng FOR UPDATE
      const stockRows = await tx.query<{
        id: string;
        name: string;
        stock_quantity: number;
        availability: boolean;
      }>(
        `SELECT id, name, stock_quantity, availability 
         FROM menu_items 
         WHERE id = ANY($1) 
         FOR UPDATE;`,
        [menuItemIds]
      );

      const stockMap = new Map(stockRows.map(s => [s.id, s]));
      const insufficientItems: string[] = [];

      for (const [mId, reqInfo] of quantityByMenuItem.entries()) {
        const stockInfo = stockMap.get(mId);
        if (!stockInfo || !stockInfo.availability || stockInfo.stock_quantity < reqInfo.totalQty) {
          const available = stockInfo ? stockInfo.stock_quantity : 0;
          insufficientItems.push(`${reqInfo.name} (cần ${reqInfo.totalQty}, chỉ còn ${available})`);
        }
      }

      // NẾU BẤT KỲ MÓN NÀO KHÔNG ĐỦ HÀNG -> ROLLBACK TOÀN BỘ BATCH!
      if (insufficientItems.length > 0) {
        throw {
          code: 'INSUFFICIENT_STOCK',
          message: `Không đủ tồn kho để gửi bếp cho: ${insufficientItems.join('; ')}. Toàn bộ lượt gửi đã được hoàn tác.`,
          insufficientItems,
        };
      }

      // 3. Trừ tồn kho từng món đúng số lượng
      for (const [mId, reqInfo] of quantityByMenuItem.entries()) {
        await tx.execute(
          `UPDATE menu_items 
           SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2;`,
          [reqInfo.totalQty, mId]
        );
      }

      // 4. Xác định số thứ tự batch
      const maxBatchRow = await tx.queryOne<{ max_num: number | null }>(
        `SELECT MAX(batch_number) as max_num FROM kitchen_batches WHERE order_id = $1;`,
        [orderId]
      );
      const nextBatchNumber = (maxBatchRow?.max_num || 0) + 1;

      // 5. Tạo kitchen_batch
      const batchId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO kitchen_batches (
          id, order_id, batch_number, idempotency_key, sent_at, created_by, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP);`,
        [batchId, orderId, nextBatchNumber, idempotencyKey, actor.userId]
      );

      // 6. Ghi Sổ cái tồn kho (inventory_ledger) và Cập nhật trạng thái từng món sang SENT_TO_KITCHEN
      for (const item of newItems) {
        const ledgerId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO inventory_ledger (
            id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id, created_at
          ) VALUES ($1, $2, $3, 'DEDUCT_ON_SEND', $4, $5, $6, CURRENT_TIMESTAMP);`,
          [
            ledgerId,
            item.menu_item_id,
            item.id,
            -item.quantity, // Lượng trừ âm
            idempotencyKey,
            actor.userId,
          ]
        );

        // Chuyển món sang SENT_TO_KITCHEN
        await tx.execute(
          `UPDATE order_items 
           SET status = 'SENT_TO_KITCHEN', kitchen_batch_id = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2;`,
          [batchId, item.id]
        );

        // Lịch sử món
        await tx.execute(
          `INSERT INTO order_status_history (id, order_id, order_item_id, from_status, to_status, changed_by, changed_at, note)
           VALUES ($1, $2, $3, 'NEW', 'SENT_TO_KITCHEN', $4, CURRENT_TIMESTAMP, $5);`,
          [crypto.randomUUID(), orderId, item.id, actor.userId, `Gửi bếp Batch #${nextBatchNumber}`]
        );
      }

      // 7. Cập nhật Order status
      const nextOrderStatus = order.status === 'OPEN' ? 'SENT_TO_KITCHEN' : order.status;
      await tx.execute(
        `UPDATE orders 
         SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2;`,
        [nextOrderStatus, orderId]
      );

      // Lấy thời điểm sent_at vừa tạo
      const createdBatch = await tx.queryOne<{ sent_at: string }>(
        `SELECT sent_at FROM kitchen_batches WHERE id = $1;`,
        [batchId]
      );

      return {
        batchId,
        batchNumber: nextBatchNumber,
        sentAt: createdBatch?.sent_at,
        orderId,
        orderCode: order.order_code,
        itemCount: newItems.length,
        items: newItems.map(i => ({ id: i.id, name: i.item_name_snapshot, quantity: i.quantity })),
      };
    });

    // 8. Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'SEND_TO_KITCHEN',
      entityType: 'KITCHEN_BATCH',
      entityId: result.batchId,
      details: {
        orderCode: result.orderCode,
        batchNumber: result.batchNumber,
        itemCount: result.itemCount,
        idempotencyKey,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: `Đã gửi Batch #${result.batchNumber} gồm ${result.itemCount} món tới bếp thành công.`,
      batch: result,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Lỗi API POST /api/orders/[id]/send-to-kitchen:', error);
    if (error.code === 'INSUFFICIENT_STOCK' || error.code === 'NO_NEW_ITEMS' || error.code === 'ORDER_ALREADY_CLOSED') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message, insufficientItems: error.insufficientItems },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi gửi món vào bếp.' },
      { status: 500 }
    );
  }
}
