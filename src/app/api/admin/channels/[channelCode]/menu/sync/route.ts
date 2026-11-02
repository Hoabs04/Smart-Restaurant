import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await params;
    const diffs = await salesChannelOrderService.getMenuSyncDiffs(channelCode);

    const priceChangedCount = diffs.filter(d => d.isPriceChanged).length;
    const outOfStockCount = diffs.filter(d => d.isOutOfStock).length;

    return NextResponse.json({
      success: true,
      channelCode: channelCode.toUpperCase(),
      diffs,
      summary: {
        totalMapped: diffs.length,
        priceChangedCount,
        outOfStockCount,
      },
    });
  } catch (error: any) {
    console.error('Lỗi GET /api/admin/channels/[channelCode]/menu/sync:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi so khớp bảng giá menu.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await params;
    const body = await req.json();
    const { mappingIds, confirmed } = body;

    // YÊU CẦU BẮT BUỘC: Phải có xác nhận rõ ràng của người dùng mới được đẩy giá lên sàn!
    if (!confirmed) {
      return NextResponse.json(
        {
          success: false,
          code: 'CONFIRMATION_REQUIRED',
          message: 'Hệ thống yêu cầu xác nhận rõ ràng của Quản lý trước khi cập nhật giá hoặc danh mục lên sàn.',
        },
        { status: 400 }
      );
    }

    const result = await salesChannelOrderService.syncChannelMenu(
      channelCode,
      mappingIds,
      auth.user.userId
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error('Lỗi POST /api/admin/channels/[channelCode]/menu/sync:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi đồng bộ menu lên sàn.' },
      { status: 500 }
    );
  }
}

