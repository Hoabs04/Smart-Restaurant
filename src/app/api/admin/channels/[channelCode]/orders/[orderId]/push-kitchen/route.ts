import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string; orderId: string }> }
) {
  const auth = await requireAuth(req, ['manager', 'waiter']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { orderId } = await context.params;

    const result = await salesChannelOrderService.pushOrderToKitchen(orderId, actor.userId);

    return NextResponse.json({
      success: true,
      message: result.message,
      internalOrderId: result.internalOrderId,
      batchId: result.batchId,
    });
  } catch (error: any) {
    console.error('Lỗi khi đẩy đơn vào bếp:', error);
    return NextResponse.json(
      { success: false, code: 'PUSH_TO_KITCHEN_FAILED', message: error?.message || 'Lỗi khi đẩy đơn vào Bếp.' },
      { status: 400 }
    );
  }
}

