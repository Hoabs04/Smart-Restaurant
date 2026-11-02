import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';

export async function GET(req: NextRequest) {
  // Chỉ quản lý (manager) mới có quyền truy cập quản trị kênh bán hàng
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const db = await getDb();

    // Lấy danh sách kênh cùng thông tin credential cơ bản
    const channels = await db.query<{
      id: string;
      code: string;
      name: string;
      logo_url: string | null;
      is_active: boolean;
      connection_status: string;
      last_sync_at: string | null;
      last_error_message: string | null;
      auto_confirm_order: boolean;
      merchant_id: string | null;
      environment: string | null;
    }>(
      `SELECT 
        c.id, c.code, c.name, c.logo_url, c.is_active, c.connection_status,
        c.last_sync_at, c.last_error_message, c.auto_confirm_order,
        cr.merchant_id, cr.environment
       FROM sales_channels c
       LEFT JOIN channel_credentials cr ON c.id = cr.channel_id
       ORDER BY c.name ASC;`
    );

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from') || undefined;
    const toDate = searchParams.get('to') || undefined;

    // Lấy các chỉ số tổng hợp
    const metrics = await salesChannelOrderService.getDashboardMetrics({ fromDate, toDate });

    return NextResponse.json({
      success: true,
      channels: channels.map(c => ({
        ...c,
        hasCredentials: Boolean(c.merchant_id),
      })),
      metrics,
    });
  } catch (error) {
    console.error('Lỗi GET /api/admin/channels:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách kênh bán hàng.' },
      { status: 500 }
    );
  }
}

