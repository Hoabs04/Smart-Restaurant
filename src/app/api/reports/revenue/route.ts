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
    const source = searchParams.get('source') || 'ALL'; // ALL, DINE_IN, ONLINE

    const db = await getDb();

    let sql = `
      SELECT 
        o.id,
        o.order_code,
        o.table_id,
        o.order_source,
        o.channel_order_id,
        t.table_code,
        t.area_name,
        o.created_by,
        u.display_name as creator_name,
        o.status,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.payment_confirmed_at,
        u_conf.display_name as payment_confirmer_name,
        o.payment_reference,
        COALESCE(u_closer.display_name, u_conf.display_name, 'Quản lý') as closed_by_name,
        o.created_at,
        o.closed_at
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      JOIN users u ON o.created_by = u.id
      LEFT JOIN users u_conf ON o.payment_confirmed_by = u_conf.id
      LEFT JOIN (
        SELECT order_id, changed_by, changed_at,
               ROW_NUMBER() OVER(PARTITION BY order_id ORDER BY changed_at DESC) as rn
        FROM order_status_history
        WHERE to_status = 'CLOSED'
      ) osh ON osh.order_id = o.id AND osh.rn = 1
      LEFT JOIN users u_closer ON osh.changed_by = u_closer.id
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
    if (source === 'DINE_IN') {
      sql += ` AND o.table_id IS NOT NULL`;
    } else if (source === 'ONLINE') {
      sql += ` AND (o.table_id IS NULL OR o.order_source IS NOT NULL)`;
    }

    sql += ` ORDER BY o.closed_at DESC;`;

    const rows = await db.query(sql, params);

    // Tính tổng doanh thu và tổng số order đã chốt
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const totalClosedOrders = rows.length;

    let dineInRevenue = 0;
    let dineInCount = 0;
    let onlineRevenue = 0;
    let onlineCount = 0;

    for (const r of rows) {
      const amt = Number(r.total_amount || 0);
      if (r.table_id) {
        dineInRevenue += amt;
        dineInCount++;
      } else {
        onlineRevenue += amt;
        onlineCount++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue,
        totalClosedOrders,
        dineInRevenue,
        dineInCount,
        onlineRevenue,
        onlineCount,
        source,
        fromDate: fromDate || 'Tất cả',
        toDate: toDate || 'Tất cả',
        notice: 'Báo cáo doanh thu chỉ phản ánh các đơn hàng đã CLOSED trong phạm vi mô phỏng MVP.',
      },
      orders: rows.map(r => ({
        id: r.id,
        orderCode: r.order_code,
        tableCode: r.table_code || r.order_source || 'Trực tuyến',
        areaName: r.area_name || 'Giao hàng',
        orderSource: r.order_source || (r.table_id ? 'DINE_IN' : 'ONLINE'),
        channelOrderId: r.channel_order_id,
        creatorName: r.creator_name,
        closedByName: r.closed_by_name || r.payment_confirmer_name || 'Quản lý',
        paymentConfirmerName: r.payment_confirmer_name,
        paymentStatus: r.payment_status || 'MANUALLY_CONFIRMED',
        paymentMethod: r.payment_method || 'TRANSFER',
        paymentReference: r.payment_reference,
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
