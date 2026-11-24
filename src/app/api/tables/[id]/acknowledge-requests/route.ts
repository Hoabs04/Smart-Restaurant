import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const { id: tableId } = await context.params;
    const db = await getDb();

    const table = await db.queryOne<{ id: string; table_code: string }>(
      `SELECT id, table_code FROM dining_tables WHERE id = $1;`,
      [tableId]
    );

    if (!table) {
      return NextResponse.json(
        { success: false, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn ăn.' },
        { status: 404 }
      );
    }

    const res = await db.execute(
      `UPDATE table_service_requests
       SET status = 'ACKNOWLEDGED',
           acknowledged_by = $1,
           acknowledged_at = CURRENT_TIMESTAMP
       WHERE table_id = $2 AND status = 'PENDING';`,
      [actor.userId, tableId]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'ACKNOWLEDGE_SERVICE_REQUEST',
      entityType: 'TABLE',
      entityId: tableId,
      details: {
        tableCode: table.table_code,
        acknowledgedCount: res.rowCount,
      },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message: `Đã xác nhận xử lý yêu cầu tại ${table.table_code}.`,
      acknowledgedCount: res.rowCount,
    });
  } catch (error) {
    console.error('Lỗi POST /api/tables/[id]/acknowledge-requests:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi xác nhận yêu cầu của khách.' },
      { status: 500 }
    );
  }
}
