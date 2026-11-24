import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';
import { UnifiedOrderStatus } from '@/lib/sales-channels/types';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string; orderId: string }> }
) {
  const auth = await requireAuth(req, ['manager', 'kitchen', 'waiter']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode, orderId } = await context.params;
    const body = await req.json();
    const { status, reason } = body;

    const validStatuses: UnifiedOrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: 'Trạng thái đơn hàng không hợp lệ.' },
        { status: 400 }
      );
    }

    // Bảo vệ RBAC: Nhân viên bếp không được xác nhận hoặc hủy đơn đối tác
    if (auth.user.role === 'kitchen' && (status === 'CONFIRMED' || status === 'CANCELLED')) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Nhân viên bếp không có quyền xác nhận hoặc hủy đơn hàng kênh bán.' },
        { status: 403 }
      );
    }

    // Kiểm tra đơn hàng thuộc đúng channelCode trên URL (nếu không phải 'all')
    if (channelCode.toUpperCase() !== 'ALL') {
      const { getDb } = await import('@/lib/db');
      const db = await getDb();
      const belongs = await db.queryOne<{ id: string }>(
        `SELECT id FROM external_orders WHERE id = $1 AND UPPER(channel_code) = UPPER($2);`,
        [orderId, channelCode]
      );
      if (!belongs) {
        return NextResponse.json(
          { success: false, code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng thuộc kênh này.' },
          { status: 404 }
        );
      }
    }

    const result = await salesChannelOrderService.updateOrderStatus(orderId, status, reason);

    if (!result.success) {
      return NextResponse.json(
        { success: false, code: 'UPDATE_FAILED', message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: unknown) {
    console.error('Lỗi PUT /orders/[orderId]/status:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi cập nhật trạng thái đơn.' },
      { status: 500 }
    );
  }
}

