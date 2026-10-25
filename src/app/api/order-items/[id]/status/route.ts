import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['kitchen']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderItemId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { status: targetStatus } = body;

    if (!targetStatus || !['IN_PROGRESS', 'READY'].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: "Trạng thái chỉ có thể chuyển sang 'IN_PROGRESS' hoặc 'READY'." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (tx) => {
      // 1. Khóa và lấy thông tin order_item
      const item = await tx.queryOne<{
        id: string;
        order_id: string;
        item_name_snapshot: string;
        status: string;
      }>(
        `SELECT id, order_id, item_name_snapshot, status 
         FROM order_items 
         WHERE id = $1 FOR UPDATE;`,
        [orderItemId]
      );

      if (!item) {
        throw { code: 'ITEM_NOT_FOUND', message: 'Món ăn không tồn tại.' };
      }

      // 2. State Machine: Kiểm tra luồng chuyển tiếp hợp lệ
      // Chỉ cho phép: SENT_TO_KITCHEN -> IN_PROGRESS hoặc IN_PROGRESS -> READY
      if (targetStatus === 'IN_PROGRESS' && item.status !== 'SENT_TO_KITCHEN') {
        throw {
          code: 'INVALID_TRANSITION',
          message: `Không thể chuyển sang 'IN_PROGRESS' vì trạng thái hiện tại của món '${item.item_name_snapshot}' là '${item.status}'.`,
        };
      }

      if (targetStatus === 'READY' && item.status !== 'IN_PROGRESS') {
        throw {
          code: 'INVALID_TRANSITION',
          message: `Không thể chuyển sang 'READY' vì trạng thái hiện tại của món '${item.item_name_snapshot}' là '${item.status}'. Món phải ở trạng thái 'IN_PROGRESS' trước.`,
        };
      }

      // 3. Cập nhật trạng thái món ăn
      await tx.execute(
        `UPDATE order_items 
         SET status = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2;`,
        [targetStatus, item.id]
      );

      // Ghi lịch sử trạng thái món
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, order_item_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7);`,
        [
          crypto.randomUUID(),
          item.order_id,
          item.id,
          item.status,
          targetStatus,
          actor.userId,
          `Bếp cập nhật trạng thái món: ${item.status} -> ${targetStatus}`,
        ]
      );

      // 4. Đánh giá và cập nhật Order State Machine
      const allItems = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM order_items WHERE order_id = $1;`,
        [item.order_id]
      );

      const activeItems = allItems.filter(i => i.status !== 'CANCELLED');
      const allReady = activeItems.length > 0 && activeItems.every(i => i.status === 'READY');
      const hasInProgress = activeItems.some(i => i.status === 'IN_PROGRESS');

      let newOrderStatus = null;
      if (allReady) {
        newOrderStatus = 'READY_TO_CLOSE';
      } else if (hasInProgress) {
        newOrderStatus = 'IN_PROGRESS';
      }

      if (newOrderStatus) {
        await tx.execute(
          `UPDATE orders 
           SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND status != 'CLOSED';`,
          [newOrderStatus, item.order_id]
        );
      }

      return {
        orderItemId: item.id,
        itemName: item.item_name_snapshot,
        fromStatus: item.status,
        toStatus: targetStatus,
        orderId: item.order_id,
        newOrderStatus,
      };
    });

    // 5. Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_ITEM_STATUS',
      entityType: 'ORDER_ITEM',
      entityId: result.orderItemId,
      details: {
        itemName: result.itemName,
        fromStatus: result.fromStatus,
        toStatus: result.toStatus,
        orderId: result.orderId,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật trạng thái món '${result.itemName}' sang ${result.toStatus}.`,
      data: result,
    });

  } catch (error: any) {
    console.error('Lỗi API PATCH /api/order-items/[id]/status:', error);
    if (error.code === 'INVALID_TRANSITION' || error.code === 'INVALID_STATUS') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi cập nhật trạng thái món.' },
      { status: 500 }
    );
  }
}
