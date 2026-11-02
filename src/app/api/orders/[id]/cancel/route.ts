import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderId } = await context.params;

    const body = await req.json().catch(() => ({}));
    const { cancel_reason } = body;

    if (!cancel_reason || typeof cancel_reason !== 'string' || !cancel_reason.trim()) {
      return NextResponse.json(
        { success: false, code: 'REASON_REQUIRED', message: 'Vui lòng cung cấp lý do hủy đơn hàng.' },
        { status: 400 }
      );
    }

    const trimmedReason = cancel_reason.trim();

    const result = await withTransaction(async (tx) => {
      // 1. Khóa và lấy thông tin Order
      const order = await tx.queryOne<{
        id: string;
        order_code: string;
        table_id: string;
        status: string;
        total_amount: number;
      }>(
        `SELECT id, order_code, table_id, status, total_amount 
         FROM orders 
         WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!order) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng cần hủy.' };
      }

      if (order.status === 'CLOSED') {
        throw { code: 'ORDER_ALREADY_CLOSED', message: 'Đơn hàng này đã được đóng trước đó.' };
      }

      // 2. Lấy toàn bộ món trong đơn
      const items = await tx.query<{
        id: string;
        menu_item_id: string;
        quantity: number;
        status: string;
      }>(
        `SELECT id, menu_item_id, quantity, status 
         FROM order_items 
         WHERE order_id = $1 FOR UPDATE;`,
        [orderId]
      );

      const activeItems = items.filter(it => it.status !== 'CANCELLED');

      // 3. Xử lý hoàn kho và hủy từng món chưa hủy
      for (const item of activeItems) {
        if (item.status === 'SENT_TO_KITCHEN') {
          // Hoàn tồn kho
          await tx.execute(
            `UPDATE menu_items 
             SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2;`,
            [item.quantity, item.menu_item_id]
          );

          // Ghi sổ cái hoàn kho
          const ledgerId = crypto.randomUUID();
          const idempKey = `cancel_order_${orderId}_${item.id}_${Date.now()}`;
          await tx.execute(
            `INSERT INTO inventory_ledger (
              id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id, created_at
            ) VALUES ($1, $2, $3, 'RESTORE_ON_CANCEL', $4, $5, $6, CURRENT_TIMESTAMP);`,
            [
              ledgerId,
              item.menu_item_id,
              item.id,
              item.quantity,
              idempKey,
              actor.userId,
            ]
          );
        }

        // Cập nhật món sang CANCELLED
        await tx.execute(
          `UPDATE order_items 
           SET status = 'CANCELLED', cancel_reason = $1, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2;`,
          [`Hủy toàn bộ đơn: ${trimmedReason}`, item.id]
        );

        // Ghi lịch sử từng món
        await tx.execute(
          `INSERT INTO order_status_history (id, order_id, order_item_id, from_status, to_status, changed_by, changed_at, note)
           VALUES ($1, $2, $3, $4, 'CANCELLED', $5, CURRENT_TIMESTAMP, $6);`,
          [crypto.randomUUID(), orderId, item.id, item.status, actor.userId, `Hủy theo đơn: ${trimmedReason}`]
        );
      }

      // 4. Chốt đơn hàng sang CLOSED (0 đồng)
      await tx.execute(
        `UPDATE orders 
         SET status = 'CLOSED', total_amount = 0, closed_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1;`,
        [orderId]
      );

      // 5. Giải phóng bàn ăn về AVAILABLE
      await tx.execute(
        `UPDATE dining_tables 
         SET status = 'AVAILABLE', version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1;`,
        [order.table_id]
      );

      // 6. Ghi lịch sử Order
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, 'CLOSED', $4, CURRENT_TIMESTAMP, $5);`,
        [crypto.randomUUID(), orderId, order.status, actor.userId, `Hủy toàn bộ đơn hàng: ${trimmedReason}`]
      );

      return {
        orderId,
        orderCode: order.order_code,
        tableId: order.table_id,
        cancelledItemsCount: activeItems.length,
      };
    });

    // 7. Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CANCEL_ORDER',
      entityType: 'ORDER',
      entityId: result.orderId,
      details: {
        orderCode: result.orderCode,
        cancelledItemsCount: result.cancelledItemsCount,
        reason: trimmedReason,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: `Đã hủy toàn bộ đơn hàng ${result.orderCode} thành công. Bàn ăn đã được giải phóng.`,
      data: result,
    });

  } catch (error: any) {
    console.error('Lỗi API POST /api/orders/[id]/cancel:', error);
    if (error.code === 'ORDER_NOT_FOUND' || error.code === 'ORDER_ALREADY_CLOSED') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi hủy đơn hàng.' },
      { status: 500 }
    );
  }
}
