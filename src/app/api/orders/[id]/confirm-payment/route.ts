import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Chỉ cho phép waiter và manager xác nhận thanh toán (Kitchen bị từ chối 403)
  const auth = await requireAuth(req, ['waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: orderId } = await context.params;
    let body: { paymentReference?: string; note?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body rỗng được chấp nhận
    }

    const db = await getDb();

    // 1. Kiểm tra đơn hàng hiện tại
    const existingOrder = await db.queryOne<{
      id: string;
      order_code: string;
      table_id: string;
      status: string;
      total_amount: number;
      payment_status: string | null;
      payment_confirmed_at: string | null;
      payment_confirmed_by: string | null;
      payment_reference: string | null;
    }>(
      `SELECT id, order_code, table_id, status, total_amount, payment_status, payment_confirmed_at, payment_confirmed_by, payment_reference
       FROM orders
       WHERE id = $1;`,
      [orderId]
    );

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng yêu cầu.' },
        { status: 404 }
      );
    }

    // Không thể xác nhận thanh toán cho đơn hàng đã hủy hoàn toàn
    if (existingOrder.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, code: 'ORDER_CANCELLED', message: 'Đơn hàng này đã bị hủy, không thể xác nhận thanh toán.' },
        { status: 400 }
      );
    }

    // 2. Cơ chế Idempotency: nếu đơn hàng đã được MANUALLY_CONFIRMED trước đó, trả về thành công an toàn không ghi lặp
    if (existingOrder.payment_status === 'MANUALLY_CONFIRMED') {
      return NextResponse.json({
        success: true,
        message: 'Thanh toán đơn hàng đã được xác nhận trước đó (Idempotent).',
        alreadyConfirmed: true,
        paymentStatus: 'MANUALLY_CONFIRMED',
        paymentConfirmedAt: existingOrder.payment_confirmed_at,
        paymentConfirmedBy: existingOrder.payment_confirmed_by,
      });
    }

    // 3. Thực hiện cập nhật trạng thái thanh toán trong transaction an toàn
    const confirmedTime = new Date().toISOString();
    const reference = body.paymentReference?.trim() || `REF-${Date.now().toString(36).toUpperCase()}`;

    await withTransaction(async (tx) => {
      // Khóa bản ghi order
      const lockedOrder = await tx.queryOne<{ id: string; status: string; payment_status: string | null }>(
        `SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE;`,
        [orderId]
      );

      if (!lockedOrder) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng.' };
      }

      if (lockedOrder.payment_status === 'MANUALLY_CONFIRMED') {
        return; // Đã được thread khác xác nhận
      }

      // Cập nhật payment_status, payment_method, payment_confirmed_at, payment_confirmed_by
      await tx.execute(
        `UPDATE orders
         SET payment_method = 'TRANSFER',
             payment_status = 'MANUALLY_CONFIRMED',
             payment_confirmed_at = CURRENT_TIMESTAMP,
             payment_confirmed_by = $1,
             payment_reference = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [actor.userId, reference, orderId]
      );

      // Ghi nhận vào lịch sử đơn hàng
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, $3, $3, $4, CURRENT_TIMESTAMP, $5);`,
        [
          crypto.randomUUID(),
          orderId,
          lockedOrder.status,
          actor.userId,
          `Nhân viên ${actor.displayName} đã kiểm tra và xác nhận nhận chuyển khoản ngân hàng`,
        ]
      );
    });

    // 4. Ghi Audit Log cho hành động xác nhận thanh toán thủ công
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'CONFIRM_PAYMENT',
      entityType: 'ORDER',
      entityId: orderId,
      details: {
        orderCode: existingOrder.order_code,
        paymentMethod: 'TRANSFER',
        paymentStatus: 'MANUALLY_CONFIRMED',
        totalAmount: Number(existingOrder.total_amount),
        paymentReference: reference,
        confirmedBy: actor.userId,
        confirmedByName: actor.displayName,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Đã xác nhận nhận tiền chuyển khoản thành công.',
      paymentStatus: 'MANUALLY_CONFIRMED',
      paymentConfirmedAt: confirmedTime,
      paymentConfirmedBy: actor.userId,
      paymentReference: reference,
    });
  } catch (error: any) {
    console.error('Lỗi API POST /api/orders/[id]/confirm-payment:', error);
    return NextResponse.json(
      {
        success: false,
        code: error.code || 'SERVER_ERROR',
        message: error.message || 'Lỗi hệ thống khi xác nhận thanh toán đơn hàng.',
      },
      { status: error.status || 500 }
    );
  }
}
