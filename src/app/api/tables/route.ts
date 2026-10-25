import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const area = searchParams.get('area');

    const db = await getDb();

    let sql = `
      SELECT 
        t.id,
        t.area_name,
        t.table_code,
        t.capacity,
        t.status,
        t.version,
        t.is_active,
        o.id as current_order_id,
        o.order_code as current_order_code,
        o.status as current_order_status,
        o.total_amount as current_order_total,
        o.created_at as current_order_created_at,
        COUNT(oi.id) FILTER (WHERE oi.status != 'CANCELLED') as active_items_count
      FROM dining_tables t
      LEFT JOIN orders o ON t.id = o.table_id AND o.status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE')
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE t.is_active = true
    `;

    const params: any[] = [];
    if (area && area.trim()) {
      params.push(area.trim());
      sql += ` AND t.area_name = $${params.length}`;
    }

    sql += `
      GROUP BY t.id, t.area_name, t.table_code, t.capacity, t.status, t.version, t.is_active,
               o.id, o.order_code, o.status, o.total_amount, o.created_at
      ORDER BY t.area_name ASC, t.table_code ASC;
    `;

    const rows = await db.query(sql, params);

    // Lấy danh sách các khu vực hiện có
    const areas = await db.query<{ area_name: string }>(
      `SELECT DISTINCT area_name FROM dining_tables WHERE is_active = true ORDER BY area_name ASC;`
    );

    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        areaName: r.area_name,
        tableCode: r.table_code,
        capacity: r.capacity,
        status: r.status,
        version: r.version,
        currentOrder: r.current_order_id ? {
          id: r.current_order_id,
          orderCode: r.current_order_code,
          status: r.current_order_status,
          totalAmount: Number(r.current_order_total || 0),
          createdAt: r.current_order_created_at,
          activeItemsCount: Number(r.active_items_count || 0),
        } : null,
      })),
      areas: areas.map(a => a.area_name),
    });
  } catch (error) {
    console.error('Lỗi API GET /api/tables:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách bàn ăn.' },
      { status: 500 }
    );
  }
}
