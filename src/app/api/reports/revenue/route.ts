import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Chỉ Quản lý (manager) mới có quyền xem báo cáo doanh thu!
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    const db = await getDb();

    let sql = `
      SELECT 
        o.id,
        o.order_code,
        o.table_id,
        t.table_code,
        t.area_name,
        o.created_by,
        u.display_name as creator_name,
        o.status,
        o.total_amount,
        o.created_at,
        o.closed_at
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      JOIN users u ON o.created_by = u.id
      WHERE o.status = 'CLOSED'
    `;

    const params: any[] = [];
    if (fromDate) {
      params.push(`${fromDate} 00:00:00`);
      sql += ` AND o.closed_at >= $${params.length}`;
    }
    if (toDate) {
      params.push(`${toDate} 23:59:59`);
      sql += ` AND o.closed_at <= $${params.length}`;
    }

    sql += ` ORDER BY o.closed_at DESC;`;

    const rows = await db.query(sql, params);

    // Tính tổng doanh thu và tổng số order đã chốt
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const totalClosedOrders = rows.length;

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue,
        totalClosedOrders,
        fromDate: fromDate || 'Tất cả',
        toDate: toDate || 'Tất cả',
        notice: 'Báo cáo doanh thu chỉ phản ánh các đơn hàng đã CLOSED trong phạm vi mô phỏng MVP.',
      },
      orders: rows.map(r => ({
        id: r.id,
        orderCode: r.order_code,
        tableCode: r.table_code,
        areaName: r.area_name,
        creatorName: r.creator_name,
        totalAmount: Number(r.total_amount || 0),
        createdAt: r.created_at,
        closedAt: r.closed_at,
      })),
    });
  } catch (error) {
    console.error('Lỗi API GET /api/reports/revenue:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tạo báo cáo doanh thu.' },
      { status: 500 }
    );
  }
}
