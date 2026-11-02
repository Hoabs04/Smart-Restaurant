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
    const { id: orderItemId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { cancel_reason, idempotency_key } = body;

    if (!cancel_reason || !cancel_reason.trim()) {
      return NextResponse.json(
        { success: false, code: 'MISSING_CANCEL_REASON', message: 'Bắt buộc phải nhập lý do khi hủy món ăn.' },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (tx) => {
      // 1. Khóa và lấy thông tin order_item
      const item = await tx.queryOne<{
        id: string;
        order_id: string;
        menu_item_id: string;
        item_name_snapshot: string;
        unit_price_snapshot: number;
        quantity: number;
        status: string;
      }>(
        `SELECT id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status 
         FROM order_items 
         WHERE id = $1 FOR UPDATE;`,
        [orderItemId]
      );

      if (!item) {
        throw { code: 'ITEM_NOT_FOUND', message: 'Món ăn không tồn tại trong đơn hàng.' };
      }

      if (item.status === 'CANCELLED') {
        throw { code: 'ALREADY_CANCELLED', message: 'Món ăn này đã được hủy trước đó.' };
      }

      // 2. Kiểm tra quy tắc State Machine khi hủy
      if (item.status === 'IN_PROGRESS' || item.status === 'READY') {
        throw {
          code: 'CANNOT_CANCEL_COOKING_ITEM',
          message: `Không thể hủy món '${item.item_name_snapshot}' vì bếp đã bắt đầu chế biến hoặc món đã sẵn sàng.`,
        };
      }

      // Khóa và lấy thông tin Order
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
        [item.order_id]
      );

      if (!order || order.status === 'CLOSED') {
        throw { code: 'ORDER_CLOSED', message: 'Đơn hàng đã đóng, không thể hủy món.' };
      }

      let restoredStock = false;
      const idempKey = idempotency_key || `cancel_${item.id}_${Date.now()}`;

      // 3. Xử lý tồn kho
      if (item.status === 'SENT_TO_KITCHEN') {
        // Món đã gửi bếp: Phải hoàn tồn kho đúng một lần và ghi ledger
        await tx.execute(
          `UPDATE menu_items 
           SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2;`,
          [item.quantity, item.menu_item_id]
        );

        // Ghi Sổ cái hoàn tồn
        const ledgerId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO inventory_ledger (
            id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id, created_at
          ) VALUES ($1, $2, $3, 'RESTORE_ON_CANCEL', $4, $5, $6, CURRENT_TIMESTAMP);`,
          [
            ledgerId,
            item.menu_item_id,
            item.id,
            item.quantity, // Lượng hoàn dương
            idempKey,
            actor.userId,
          ]
        );
        restoredStock = true;
      } else if (item.status === 'NEW') {
        // Món NEW: Hủy không hoàn kho vì chưa trừ
        restoredStock = false;
      }

      // 4. Cập nhật trạng thái món sang CANCELLED
      await tx.execute(
        `UPDATE order_items 
         SET status = 'CANCELLED', cancel_reason = $1, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2;`,
        [cancel_reason.trim(), item.id]
      );

      // Ghi lịch sử món
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, order_item_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, $4, 'CANCELLED', $5, CURRENT_TIMESTAMP, $6);`,
        [crypto.randomUUID(), item.order_id, item.id, item.status, actor.userId, `Lý do hủy: ${cancel_reason.trim()}`]
      );

      // 5. Cập nhật lại total_amount của order (Món hủy không tính vào tổng tiền)
      const lineDeduction = Number(item.unit_price_snapshot) * item.quantity;
      const newTotal = Math.max(0, Number(order.total_amount) - lineDeduction);

      // 6. Đánh giá lại trạng thái Order
      // Lấy danh sách các món còn lại trong order
      const remainingItems = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM order_items WHERE order_id = $1 AND id != $2;`,
        [item.order_id, item.id]
      );

      const nonCancelledRemaining = remainingItems.filter(i => i.status !== 'CANCELLED');
      let newOrderStatus = order.status;
      let orderAutoClosed = false;

      if (nonCancelledRemaining.length === 0) {
        // Tất cả các món trong đơn hàng đã bị hủy:
        // Đóng đơn (CLOSED) 0 đồng và giải phóng bàn ăn về AVAILABLE
        newOrderStatus = 'CLOSED';
        orderAutoClosed = true;

        await tx.execute(
          `UPDATE orders 
           SET total_amount = 0, status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1;`,
          [item.order_id]
        );

        // Giải phóng bàn ăn: chuyển về AVAILABLE (Trống)
        await tx.execute(
          `UPDATE dining_tables 
           SET status = 'AVAILABLE', version = version + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1;`,
          [order.table_id]
        );

        // Ghi lịch sử Order
        await tx.execute(
          `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
           VALUES ($1, $2, $3, 'CLOSED', $4, CURRENT_TIMESTAMP, 'Tất cả các món đã bị hủy. Đơn hàng tự động đóng (0đ) và giải phóng bàn ăn.');`,
          [crypto.randomUUID(), item.order_id, order.status, actor.userId]
        );
      } else {
        if (nonCancelledRemaining.every(i => i.status === 'READY')) {
          // Nếu tất cả các món còn lại đều READY -> Chuyển sang READY_TO_CLOSE
          newOrderStatus = 'READY_TO_CLOSE';
        }

        await tx.execute(
          `UPDATE orders 
           SET total_amount = $1, status = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3;`,
          [newTotal, newOrderStatus, item.order_id]
        );
      }

      return {
        orderItemId: item.id,
        orderId: item.order_id,
        orderCode: order.order_code,
        itemName: item.item_name_snapshot,
        previousStatus: item.status,
        quantity: item.quantity,
        restoredStock,
        newOrderTotal: orderAutoClosed ? 0 : newTotal,
        newOrderStatus,
        cancelReason: cancel_reason.trim(),
        orderAutoClosed,
        tableReleased: orderAutoClosed,
      };
    });

    // 7. Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CANCEL_ITEM',
      entityType: 'ORDER_ITEM',
      entityId: result.orderItemId,
      details: {
        orderCode: result.orderCode,
        itemName: result.itemName,
        quantity: result.quantity,
        previousStatus: result.previousStatus,
        restoredStock: result.restoredStock,
        reason: result.cancelReason,
      },
      ipAddress: ip,
    });

    if (result.orderAutoClosed) {
      await logAudit({
        actorId: actor.userId,
        action: 'CLOSE_ORDER',
        entityType: 'ORDER',
        entityId: result.orderId,
        details: {
          orderCode: result.orderCode,
          totalAmount: 0,
          notice: 'Đơn hàng tự động đóng và giải phóng bàn ăn do toàn bộ món đã bị hủy',
        },
        ipAddress: ip,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Đã hủy món '${result.itemName}' thành công.${result.restoredStock ? ' Đã hoàn tồn kho đúng 1 lần.' : ''}${result.orderAutoClosed ? ' Toàn bộ món đã hủy: Đơn hàng đã tự động chốt và giải phóng bàn ăn.' : ''}`,
      data: result,
    });

  } catch (error: any) {
    console.error('Lỗi API POST /api/order-items/[id]/cancel:', error);
    if (error.code === 'CANNOT_CANCEL_COOKING_ITEM' || error.code === 'ALREADY_CANCELLED' || error.code === 'ORDER_CLOSED') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi hủy món ăn.' },
      { status: 500 }
    );
  }
}
