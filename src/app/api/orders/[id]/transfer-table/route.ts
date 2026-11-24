import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderId } = await context.params;
    const body = await req.json().catch(() => null);
    const targetTableId = typeof body?.target_table_id === 'string' ? body.target_table_id.trim() : '';

    if (!targetTableId) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng chọn bàn đích cần chuyển tới.' },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (tx) => {
      const order = await tx.queryOne<{
        id: string;
        order_code: string;
        table_id: string | null;
        status: string;
      }>(
        `SELECT id, order_code, table_id, status
         FROM orders
         WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!order) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng.', status: 404 };
      }

      if (order.status === 'CLOSED') {
        throw { code: 'ORDER_CLOSED', message: 'Đơn hàng đã chốt, không thể chuyển bàn.', status: 400 };
      }

      if (!order.table_id) {
        throw { code: 'NOT_DINE_IN', message: 'Chỉ hỗ trợ chuyển bàn cho đơn ăn tại quán.', status: 400 };
      }

      if (order.table_id === targetTableId) {
        throw { code: 'SAME_TABLE', message: 'Đơn hàng đang ở bàn này rồi.', status: 400 };
      }

      // Khóa 2 bàn theo thứ tự id tăng dần để chống deadlock
      const tableIds = [order.table_id, targetTableId].sort();
      const tables = await tx.query<{
        id: string;
        table_code: string;
        area_name: string;
        status: string;
        is_active: boolean;
      }>(
        `SELECT id, table_code, area_name, status, is_active
         FROM dining_tables
         WHERE id = ANY($1)
         ORDER BY id ASC
         FOR UPDATE;`,
        [tableIds]
      );

      const oldTable = tables.find(t => t.id === order.table_id);
      const newTable = tables.find(t => t.id === targetTableId);

      if (!newTable || !newTable.is_active) {
        throw { code: 'TARGET_TABLE_NOT_FOUND', message: 'Bàn đích không tồn tại hoặc đang ngừng hoạt động.', status: 404 };
      }

      if (newTable.status !== 'AVAILABLE') {
        throw {
          code: 'TARGET_TABLE_OCCUPIED',
          message: `Bàn ${newTable.table_code} hiện không trống, vui lòng chọn bàn khác.`,
          status: 409,
        };
      }

      const existingOpenOnTarget = await tx.queryOne<{ id: string }>(
        `SELECT id FROM orders WHERE table_id = $1 AND status <> 'CLOSED' LIMIT 1;`,
        [targetTableId]
      );
      if (existingOpenOnTarget) {
        throw {
          code: 'TARGET_TABLE_OCCUPIED',
          message: `Bàn ${newTable.table_code} đang có đơn mở khác.`,
          status: 409,
        };
      }

      const nextTargetStatus = oldTable?.status === 'AWAITING_PAYMENT' ? 'AWAITING_PAYMENT' : 'OCCUPIED';

      await tx.execute(
        `UPDATE orders
         SET table_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [targetTableId, orderId]
      );

      if (oldTable) {
        await tx.execute(
          `UPDATE dining_tables
           SET status = 'AVAILABLE', version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [oldTable.id]
        );
      }

      await tx.execute(
        `UPDATE dining_tables
         SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [nextTargetStatus, targetTableId]
      );

      if (oldTable) {
        await tx.execute(
          `UPDATE table_service_requests
           SET table_id = $1
           WHERE table_id = $2 AND status = 'PENDING';`,
          [targetTableId, oldTable.id]
        );
      }

      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, $3, $4, CURRENT_TIMESTAMP, $5);`,
        [
          crypto.randomUUID(),
          orderId,
          order.status,
          actor.userId,
          `Chuyển bàn từ ${oldTable?.table_code || 'N/A'} sang ${newTable.table_code}`,
        ]
      );

      return {
        orderId,
        orderCode: order.order_code,
        fromTableCode: oldTable?.table_code || 'N/A',
        toTableCode: newTable.table_code,
        toAreaName: newTable.area_name,
      };
    });

    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_TABLE',
      entityType: 'ORDER',
      entityId: orderId,
      details: {
        action: 'TRANSFER_TABLE',
        orderCode: result.orderCode,
        fromTable: result.fromTableCode,
        toTable: result.toTableCode,
      },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message: `Đã chuyển đơn ${result.orderCode} từ ${result.fromTableCode} sang ${result.toTableCode}.`,
      data: result,
    });
  } catch (error: any) {
    if (error?.status && error?.code) {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: error.status }
      );
    }
    console.error('Lỗi POST /api/orders/[id]/transfer-table:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi chuyển bàn.' },
      { status: 500 }
    );
  }
}
