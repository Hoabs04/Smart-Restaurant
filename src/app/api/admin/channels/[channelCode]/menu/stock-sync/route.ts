import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await params;
    const result = await salesChannelOrderService.syncChannelStock(channelCode);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error('Lỗi POST /api/admin/channels/[channelCode]/menu/stock-sync:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi làm mới trạng thái tồn kho lên sàn.' },
      { status: 500 }
    );
  }
}

