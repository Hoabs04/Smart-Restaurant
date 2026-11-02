import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';
import { getDb } from '@/lib/db';

/**
 * Chống CSV Formula Injection & Escape dấu nháy kép cho ô dữ liệu CSV tuân theo RFC 4180
 */
function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Ngăn chặn CSV Formula Injection nếu bắt đầu bằng các ký tự công thức: '=', '+', '-', '@', '\t', '\r'
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape dấu nháy kép bằng cặp nháy kép
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from') || undefined;
    const toDate = searchParams.get('to') || undefined;
    const channelCode = searchParams.get('channel') || undefined;
    const format = searchParams.get('format') || 'json';

    const metrics = await salesChannelOrderService.getDashboardMetrics({
      fromDate,
      toDate,
      channelCode,
    });

    if (format === 'csv') {
      const db = await getDb();
      let orderSql = `
        SELECT 
          o.channel_code,
          o.external_order_code,
          o.normalized_status,
          o.total_amount,
          o.platform_fee,
          o.net_revenue,
          o.driver_name,
          o.ordered_at
        FROM external_orders o
        WHERE 1=1
      `;
      const orderParams: any[] = [];
      if (fromDate) {
        orderParams.push(`${fromDate} 00:00:00`);
        orderSql += ` AND o.ordered_at >= $${orderParams.length}`;
      }
      if (toDate) {
        orderParams.push(`${toDate} 23:59:59`);
        orderSql += ` AND o.ordered_at <= $${orderParams.length}`;
      }
      if (channelCode) {
        orderParams.push(channelCode.toUpperCase());
        orderSql += ` AND UPPER(o.channel_code) = $${orderParams.length}`;
      }
      orderSql += ` ORDER BY o.ordered_at DESC;`;

      const orderRows = await db.query<{
        channel_code: string;
        external_order_code: string;
        normalized_status: string;
        total_amount: number;
        platform_fee: number;
        net_revenue: number;
        driver_name: string | null;
        ordered_at: string;
      }>(orderSql, orderParams);

      // Header tổng hợp
      let csvContent = '\uFEFF'; // UTF-8 BOM
      csvContent += 'BÁO CÁO ĐỐI SOÁT DOANH THU & CHIẾT KHẤU KÊNH BÁN HÀNG\r\n';
      csvContent += `Khoảng thời gian: ${fromDate || 'Tất cả'} đến ${toDate || 'Hiện tại'}\r\n`;
      csvContent += `Tổng doanh thu gộp: ${metrics.totalRevenue.toLocaleString('vi-VN')} VND\r\n`;
      csvContent += `Tổng chiết khấu sàn: ${metrics.totalPlatformFee.toLocaleString('vi-VN')} VND (${metrics.averageCommissionRate}%)\r\n`;
      csvContent += `Tổng thực nhận ròng: ${metrics.totalNetRevenue.toLocaleString('vi-VN')} VND\r\n\r\n`;

      // Bảng tổng kết theo kênh
      csvContent += 'Kênh Bán Hàng,Số Đơn,Doanh Thu Gộp (VND),Chiết Khấu (VND),Tỷ Lệ Chiết Khấu (%),Thực Nhận (VND),AOV (VND),Đơn Thành Công,Đơn Hủy\r\n';
      for (const c of metrics.channelSummaries) {
        csvContent += `${escapeCsvCell(c.channelName)},${c.orderCount},${c.revenue},${c.platformFee},${escapeCsvCell(c.commissionRate + '%')},${c.netRevenue},${c.averageOrderValue},${c.completedCount},${c.cancelledCount}\r\n`;
      }

      // Bảng chi tiết từng đơn
      csvContent += '\r\nCHI TIẾT ĐƠN HÀNG ĐỐI SOÁT\r\n';
      csvContent += 'Mã Kênh,Mã Đơn Sàn,Thời Gian Đặt,Trạng Thái,Tiền Khách Trả (VND),Chiết Khấu Sàn (VND),Thực Nhận (VND),Tài Xế Giao\r\n';
      for (const ord of orderRows) {
        const orderTime = new Date(ord.ordered_at).toLocaleString('vi-VN');
        csvContent += `${escapeCsvCell(ord.channel_code)},${escapeCsvCell(ord.external_order_code)},${escapeCsvCell(orderTime)},${escapeCsvCell(ord.normalized_status)},${ord.total_amount},${ord.platform_fee},${ord.net_revenue},${escapeCsvCell(ord.driver_name || 'N/A')}\r\n`;
      }

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="doi_soat_kenh_ban_hang_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      filter: { fromDate, toDate, channelCode },
      metrics,
    });
  } catch (error: any) {
    console.error('Lỗi GET /api/admin/channels/reports:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi trích xuất báo cáo kênh bán hàng.' },
      { status: 500 }
    );
  }
}

