import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, withTransaction } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const db = await getDb();

    const channel = await db.queryOne<{
      id: string;
      code: string;
      name: string;
      logo_url: string | null;
      is_active: boolean;
      connection_status: string;
      last_sync_at: string | null;
      last_error_message: string | null;
      auto_confirm_order: boolean;
      created_at: string;
    }>(
      `SELECT * FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy kênh bán hàng.' },
        { status: 404 }
      );
    }

    const credentials = await db.queryOne<{
      merchant_id: string;
      store_id: string | null;
      app_id: string | null;
      app_secret_encrypted: string;
      webhook_secret_encrypted: string | null;
      environment: string;
      token_expires_at: string | null;
    }>(
      `SELECT merchant_id, store_id, app_id, app_secret_encrypted, webhook_secret_encrypted, environment, token_expires_at
       FROM channel_credentials 
       WHERE channel_id = $1;`,
      [channel.id]
    );

    // Tính toán số lượng món đã mapping
    const mappingCountRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM channel_menu_mappings WHERE channel_id = $1;`,
      [channel.id]
    );

    // Tính toán số đơn hôm nay
    const todayOrdersRow = await db.queryOne<{ count: number; total_amount: number }>(
      `SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::int as total_amount
       FROM external_orders
       WHERE channel_id = $1 AND DATE(ordered_at) = CURRENT_DATE;`,
      [channel.id]
    );

    return NextResponse.json({
      success: true,
      channel: {
        ...channel,
        mappingCount: mappingCountRow ? Number(mappingCountRow.count) : 0,
        todayOrderCount: todayOrdersRow ? Number(todayOrdersRow.count) : 0,
        todayRevenue: todayOrdersRow ? Number(todayOrdersRow.total_amount) : 0,
        credentials: credentials
          ? {
              merchantId: credentials.merchant_id,
              storeId: credentials.store_id || '',
              appId: credentials.app_id || '',
              hasAppSecret: Boolean(credentials.app_secret_encrypted),
              hasWebhookSecret: Boolean(credentials.webhook_secret_encrypted),
              environment: credentials.environment || 'SANDBOX',
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Lỗi GET /api/admin/channels/[channelCode]:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải thông tin kênh.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const actor = auth.user;

  try {
    const { channelCode } = await context.params;
    const body = await req.json();
    const {
      is_active,
      auto_confirm_order,
      merchant_id,
      store_id,
      app_id,
      app_secret,
      webhook_secret,
      environment,
    } = body;

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

    await withTransaction(async (tx) => {
      // 1. Cập nhật bảng sales_channels
      await tx.execute(
        `UPDATE sales_channels
         SET is_active = COALESCE($1, is_active),
             auto_confirm_order = COALESCE($2, auto_confirm_order),
             connection_status = CASE WHEN $1 = FALSE THEN 'DISABLED' ELSE connection_status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [is_active !== undefined ? is_active : null, auto_confirm_order !== undefined ? auto_confirm_order : null, channel.id]
      );

      // 2. Cập nhật hoặc thêm credentials nếu có thông tin
      if (merchant_id) {
        const existingCred = await tx.queryOne<{ id: string; app_secret_encrypted: string; webhook_secret_encrypted: string }>(
          `SELECT id, app_secret_encrypted, webhook_secret_encrypted FROM channel_credentials WHERE channel_id = $1;`,
          [channel.id]
        );

        const defaultSandboxSecret = (environment || 'SANDBOX') === 'SANDBOX' ? encryptSecret('sandbox_secret_default') : '';
        let encAppSecret = app_secret ? encryptSecret(app_secret) : (existingCred?.app_secret_encrypted || defaultSandboxSecret);
        if (!encAppSecret && (environment || 'SANDBOX') === 'SANDBOX') {
          encAppSecret = defaultSandboxSecret;
        }
        const defaultSandboxWebhook = (environment || 'SANDBOX') === 'SANDBOX' ? encryptSecret('sandbox_webhook_default') : null;
        let encWebhookSecret = webhook_secret ? encryptSecret(webhook_secret) : (existingCred?.webhook_secret_encrypted || defaultSandboxWebhook);
        if (!encWebhookSecret && (environment || 'SANDBOX') === 'SANDBOX') {
          encWebhookSecret = defaultSandboxWebhook;
        }

        if (existingCred) {
          await tx.execute(
            `UPDATE channel_credentials
             SET merchant_id = $1,
                 store_id = $2,
                 app_id = $3,
                 app_secret_encrypted = $4,
                 webhook_secret_encrypted = $5,
                 environment = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7;`,
            [
              merchant_id,
              store_id || null,
              app_id || null,
              encAppSecret,
              encWebhookSecret,
              environment || 'SANDBOX',
              existingCred.id,
            ]
          );
        } else {
          await tx.execute(
            `INSERT INTO channel_credentials (
              id, channel_id, merchant_id, store_id, app_id, app_secret_encrypted,
              webhook_secret_encrypted, environment, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
            [
              crypto.randomUUID(),
              channel.id,
              merchant_id,
              store_id || null,
              app_id || null,
              encAppSecret,
              encWebhookSecret,
              environment || 'SANDBOX',
            ]
          );
        }

        // Đổi trạng thái sang CONNECTED nếu đã có merchantId và đang bật
        if (is_active) {
          await tx.execute(
            `UPDATE sales_channels SET connection_status = 'CONNECTED' WHERE id = $1;`,
            [channel.id]
          );
        }
      }
    });

    // Ghi audit log
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_SALES_CHANNEL',
      entityType: 'SALES_CHANNEL',
      entityId: channel.id,
      details: {
        channelCode,
        isActive: is_active,
        hasMerchantId: Boolean(merchant_id),
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật thông tin kênh [${channel.name}] thành công.`,
    });
  } catch (error) {
    console.error('Lỗi PUT /api/admin/channels/[channelCode]:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi lưu cấu hình kênh.' },
      { status: 500 }
    );
  }
}

