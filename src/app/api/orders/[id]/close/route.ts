import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
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

    const result = await withTransaction(async (tx) => {
      // 1. Khóa và lấy thông tin Order
      const order = await tx.queryOne<{
        id: string;
        order_code: string;
        table_id: string;
        status: string;
        total_amount: number;
        created_at: string;
      }>(
        `SELECT id, order_code, table_id, status, total_amount, created_at 
         FROM orders 
         WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!order) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng cần chốt.' };
      }

      if (order.status === 'CLOSED') {
        throw { code: 'ORDER_ALREADY_CLOSED', message: 'Đơn hàng này đã được chốt trước đó.' };
      }

      // 2. Lấy toàn bộ món trong đơn hàng để kiểm tra điều kiện chốt
      const items = await tx.query<{
        id: string;
        item_name_snapshot: string;
        unit_price_snapshot: number;
        quantity: number;
        status: string;
      }>(
        `SELECT id, item_name_snapshot, unit_price_snapshot, quantity, status 
         FROM order_items 
         WHERE order_id = $1;`,
        [orderId]
      );

      const activeItems = items.filter(it => it.status !== 'CANCELLED');

      // Nếu tất cả món bị hủy
      if (activeItems.length === 0) {
        throw {
          code: 'ALL_ITEMS_CANCELLED',
          message: 'Tất cả các món trong đơn hàng đã bị hủy. Đơn hàng không thể chốt theo luồng thông thường.',
        };
      }

      // Kiểm tra xem có món nào chưa READY không
      const notReadyItems = activeItems.filter(it => it.status !== 'READY');
      if (notReadyItems.length > 0) {
        const notReadyNames = notReadyItems.map(it => `${it.item_name_snapshot} (${it.status})`).join(', ');
        throw {
          code: 'ITEMS_NOT_READY',
          message: `Chưa thể chốt đơn: Còn các món chưa sẵn sàng: ${notReadyNames}. Chỉ chốt khi tất cả món chưa hủy đều đã READY.`,
        };
      }

      // 3. Tính lại tổng tiền chính xác từ snapshot các món chưa hủy
      const verifiedTotal = activeItems.reduce(
        (sum, it) => sum + Number(it.unit_price_snapshot) * it.quantity,
        0
      );

      // 4. Chốt đơn hàng: chuyển status sang CLOSED
      await tx.execute(
        `UPDATE orders 
         SET status = 'CLOSED', total_amount = $1, closed_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2;`,
        [verifiedTotal, orderId]
      );

      // 5. Giải phóng bàn ăn: chuyển về AVAILABLE (Trống)
      await tx.execute(
        `UPDATE dining_tables 
         SET status = 'AVAILABLE', version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1;`,
        [order.table_id]
      );

      // 6. Ghi lịch sử Order
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, 'CLOSED', $4, CURRENT_TIMESTAMP, 'Chốt đơn mô phỏng và giải phóng bàn ăn');`,
        [crypto.randomUUID(), orderId, order.status, actor.userId]
      );

      // Lấy thông tin bàn
      const table = await tx.queryOne<{ table_code: string; area_name: string }>(
        `SELECT table_code, area_name FROM dining_tables WHERE id = $1;`,
        [order.table_id]
      );

      return {
        orderId,
        orderCode: order.order_code,
        tableCode: table?.table_code || 'N/A',
        areaName: table?.area_name || 'N/A',
        totalAmount: verifiedTotal,
        closedAt: new Date().toISOString(),
        itemCount: activeItems.length,
        notice: 'Hóa đơn mô phỏng – không thực hiện thanh toán thật',
      };
    });

    // 7. Ghi Audit Log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CLOSE_ORDER',
      entityType: 'ORDER',
      entityId: result.orderId,
      details: {
        orderCode: result.orderCode,
        tableCode: result.tableCode,
        totalAmount: result.totalAmount,
        notice: result.notice,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Chốt đơn hàng mô phỏng thành công. Bàn ăn đã được giải phóng.',
      invoice: result,
    });

  } catch (error: any) {
    console.error('Lỗi API POST /api/orders/[id]/close:', error);
    if (error.code === 'ITEMS_NOT_READY' || error.code === 'ALL_ITEMS_CANCELLED' || error.code === 'ORDER_ALREADY_CLOSED') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi chốt đơn hàng.' },
      { status: 500 }
    );
  }
}
