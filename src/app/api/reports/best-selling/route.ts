import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Chỉ Quản lý (manager) mới có quyền xem báo cáo món bán chạy!
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const db = await getDb();

    let sql = `
      SELECT 
        oi.menu_item_id,
        oi.item_name_snapshot as item_name,
        c.name as category_name,
        SUM(oi.quantity) as total_quantity_sold,
        SUM(oi.quantity * oi.unit_price_snapshot) as total_sales_amount
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items m ON oi.menu_item_id = m.id
      JOIN menu_categories c ON m.category_id = c.id
      WHERE o.status = 'CLOSED' AND oi.status != 'CANCELLED'
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

    sql += `
      GROUP BY oi.menu_item_id, oi.item_name_snapshot, c.name
      ORDER BY total_quantity_sold DESC, total_sales_amount DESC
      LIMIT $${params.length + 1};
    `;
    params.push(limit);

    const rows = await db.query(sql, params);

    return NextResponse.json({
      success: true,
      items: rows.map((r, index) => ({
        rank: index + 1,
        menuItemId: r.menu_item_id,
        itemName: r.item_name,
        categoryName: r.category_name,
        totalQuantitySold: Number(r.total_quantity_sold || 0),
        totalSalesAmount: Number(r.total_sales_amount || 0),
      })),
      notice: 'Dữ liệu chỉ phản ánh các món ăn đã hoàn thành trong các đơn CLOSED.',
    });
  } catch (error) {
    console.error('Lỗi API GET /api/reports/best-selling:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi thống kê món bán chạy.' },
      { status: 500 }
    );
  }
}
