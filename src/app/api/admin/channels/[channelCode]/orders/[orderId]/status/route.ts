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
    const { orderId } = await context.params;
    const body = await req.json();
    const { status, reason } = body;

    const validStatuses: UnifiedOrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: 'Trạng thái đơn hàng không hợp lệ.' },
        { status: 400 }
      );
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
  } catch (error: any) {
    console.error('Lỗi PUT /orders/[orderId]/status:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: error?.message || 'Lỗi khi cập nhật trạng thái đơn.' },
      { status: 500 }
    );
  }
}

