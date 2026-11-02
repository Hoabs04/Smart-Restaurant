import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 100);

    const db = await getDb();

    const channel = await db.queryOne<{ id: string }>(
      `SELECT id FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy kênh.' },
        { status: 404 }
      );
    }

    const logs = await db.query<{
      id: string;
      sync_type: string;
      direction: string;
      status: string;
      retry_count: number;
      request_data: string | null;
      response_data: string | null;
      error_message: string | null;
      created_at: string;
    }>(
      `SELECT id, sync_type, direction, status, retry_count, request_data, response_data, error_message, created_at
       FROM sync_logs
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [channel.id, limit]
    );

    return NextResponse.json({
      success: true,
      logs: logs.map(l => ({
        ...l,
        requestData: l.request_data ? JSON.parse(l.request_data) : null,
        responseData: l.response_data ? JSON.parse(l.response_data) : null,
      })),
    });
  } catch (error) {
    console.error('Lỗi GET /logs:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải nhật ký đồng bộ.' },
      { status: 500 }
    );
  }
}

