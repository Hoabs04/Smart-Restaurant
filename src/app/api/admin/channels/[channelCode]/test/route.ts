import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { getChannelProvider } from '@/lib/sales-channels/factory';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const db = await getDb();

    const channel = await db.queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy kênh bán hàng.' },
        { status: 404 }
      );
    }

    const credRow = await db.queryOne<{
      merchant_id: string;
      store_id: string | null;
      app_id: string | null;
      app_secret_encrypted: string;
      webhook_secret_encrypted: string | null;
      environment: 'SANDBOX' | 'PRODUCTION';
    }>(
      `SELECT merchant_id, store_id, app_id, app_secret_encrypted, webhook_secret_encrypted, environment
       FROM channel_credentials
       WHERE channel_id = $1;`,
      [channel.id]
    );

    if (!credRow || !credRow.merchant_id) {
      return NextResponse.json(
        { success: false, code: 'UNCONFIGURED', message: 'Kênh chưa được cấu hình Merchant ID và Secret.' },
        { status: 400 }
      );
    }

    let appSecret = credRow.app_secret_encrypted ? decryptSecret(credRow.app_secret_encrypted) : '';
    if (!appSecret && credRow.environment === 'SANDBOX') {
      appSecret = 'sandbox_secret_default';
    }
    const provider = getChannelProvider(channelCode);

    const testResult = await provider.testConnection({
      merchantId: credRow.merchant_id,
      storeId: credRow.store_id || undefined,
      appId: credRow.app_id || undefined,
      appSecret,
      environment: credRow.environment || 'SANDBOX',
    });

    // Cập nhật trạng thái kênh dựa trên kết quả test
    await db.execute(
      `UPDATE sales_channels
       SET connection_status = $1,
           last_error_message = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3;`,
      [testResult.success ? 'CONNECTED' : 'ERROR', testResult.success ? null : testResult.message, channel.id]
    );

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      details: testResult.details,
    });
  } catch (error: any) {
    console.error('Lỗi POST /api/admin/channels/[channelCode]/test:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: error?.message || 'Lỗi khi kiểm tra kết nối.' },
      { status: 500 }
    );
  }
}

