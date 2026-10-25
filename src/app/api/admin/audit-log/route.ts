import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Chỉ Quản lý (manager) mới có quyền xem Audit Log!
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const db = await getDb();

    let sql = `
      SELECT 
        al.id,
        al.actor_id,
        u.username as actor_username,
        u.display_name as actor_display_name,
        r.code as actor_role,
        al.action,
        al.entity_type,
        al.entity_id,
        al.details,
        al.ip_address,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_id = u.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
    `;

    const params: any[] = [];
    if (action && action.trim()) {
      params.push(action.trim());
      sql += ` WHERE al.action = $${params.length}`;
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const rows = await db.query(sql, params);

    return NextResponse.json({
      success: true,
      logs: rows.map(r => ({
        id: r.id,
        actorId: r.actor_id,
        actorUsername: r.actor_username || 'Hệ thống',
        actorDisplayName: r.actor_display_name || 'Hệ thống',
        actorRole: r.actor_role || 'system',
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Lỗi API GET /api/admin/audit-log:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải nhật ký thao tác.' },
      { status: 500 }
    );
  }
}
