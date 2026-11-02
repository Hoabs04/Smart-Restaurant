import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateOrderQrCode } from '@/lib/payment-qr';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tableCodeParam = searchParams.get('tableCode')?.trim();
    const orderCodeParam = searchParams.get('orderCode')?.trim();

    if (!tableCodeParam && !orderCodeParam) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'PARAM_REQUIRED', 
          message: 'Vui lòng cung cấp mã bàn (tableCode) hoặc mã đơn hàng (orderCode).' 
        },
        { status: 400 }
      );
    }

    const db = await getDb();
    let targetOrderId: string | null = null;
    let tableInfo: { id: string; table_code: string; area_name: string; status: string } | null = null;

    // 1. Nếu tìm theo tableCode
    if (tableCodeParam) {
      // Tìm bàn (hỗ trợ so khớp linh hoạt)
      const table = await db.queryOne<{
        id: string;
        table_code: string;
        area_name: string;
        status: string;
      }>(
        `SELECT id, table_code, area_name, status 
         FROM dining_tables 
         WHERE LOWER(table_code) = LOWER($1) OR table_code = $1 
         LIMIT 1;`,
        [tableCodeParam]
      );

      if (!table) {
        return NextResponse.json(
          { success: false, code: 'TABLE_NOT_FOUND', message: `Không tìm thấy bàn '${tableCodeParam}'.` },
          { status: 404 }
        );
      }

      tableInfo = table;

      // Tìm đơn hàng đang hoạt động của bàn này
      const activeOrder = await db.queryOne<{ id: string; order_code: string }>(
        `SELECT id, order_code 
         FROM orders 
         WHERE table_id = $1 AND status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE')
         ORDER BY created_at DESC 
         LIMIT 1;`,
        [table.id]
      );

      if (!activeOrder) {
        return NextResponse.json({
          success: true,
          hasActiveOrder: false,
          table: {
            id: table.id,
            tableCode: table.table_code,
            areaName: table.area_name,
            status: table.status,
          },
          message: `Bàn '${table.table_code}' hiện chưa có đơn gọi món nào đang hoạt động.`,
        });
      }

      targetOrderId = activeOrder.id;
    }

    // 2. Nếu tìm trực tiếp theo orderCode
    if (!targetOrderId && orderCodeParam) {
      const foundOrder = await db.queryOne<{ id: string }>(
        `SELECT id FROM orders 
         WHERE id = $1 OR UPPER(order_code) = UPPER($1) 
         LIMIT 1;`,
        [orderCodeParam]
      );

      if (!foundOrder) {
        return NextResponse.json(
          { success: false, code: 'ORDER_NOT_FOUND', message: `Không tìm thấy đơn hàng '${orderCodeParam}'.` },
          { status: 404 }
        );
      }

      targetOrderId = foundOrder.id;
    }

    if (!targetOrderId) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy thông tin đơn hàng.' },
        { status: 404 }
      );
    }

    // 3. Lấy thông tin chi tiết đơn hàng và bàn
    const order = await db.queryOne<{
      id: string;
      order_code: string;
      table_id: string;
      table_code: string;
      area_name: string;
      status: string;
      total_amount: number;
      payment_method: string | null;
      payment_status: string | null;
      payment_confirmed_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT 
        o.id,
        o.order_code,
        o.table_id,
        t.table_code,
        t.area_name,
        o.status,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.payment_confirmed_at,
        o.created_at,
        o.updated_at
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      WHERE o.id = $1;`,
      [targetOrderId]
    );

    if (!order) {
      return NextResponse.json(
        { success: false, code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng.' },
        { status: 404 }
      );
    }

    // 4. Lấy danh sách món ăn trong đơn
    const rawItems = await db.query<{
      id: string;
      item_name_snapshot: string;
      unit_price_snapshot: number;
      quantity: number;
      status: string;
      cancel_reason: string | null;
      cancelled_at: string | null;
      created_at: string;
      updated_at: string;
      batch_sent_at: string | null;
      batch_number: number | null;
    }>(
      `SELECT 
        oi.id,
        oi.item_name_snapshot,
        oi.unit_price_snapshot,
        oi.quantity,
        oi.status,
        oi.cancel_reason,
        oi.cancelled_at,
        oi.created_at,
        oi.updated_at,
        kb.sent_at as batch_sent_at,
        kb.batch_number
      FROM order_items oi
      LEFT JOIN kitchen_batches kb ON oi.kitchen_batch_id = kb.id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC, oi.id ASC;`,
      [order.id]
    );

    // 5. Tính toán tiến độ chế biến theo TỔNG SỐ LƯỢNG MÓN ĂN (chuẩn xác hơn theo số lượng thực tế)
    const items = rawItems.map((item) => ({
      id: item.id,
      itemName: item.item_name_snapshot,
      unitPrice: Number(item.unit_price_snapshot || 0),
      quantity: Number(item.quantity || 1),
      lineTotal: Number(item.unit_price_snapshot || 0) * Number(item.quantity || 1),
      status: item.status as 'NEW' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY' | 'CANCELLED',
      cancelReason: item.cancel_reason,
      cancelledAt: item.cancelled_at,
      batchSentAt: item.batch_sent_at,
      batchNumber: item.batch_number,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    const activeItems = items.filter((i) => i.status !== 'CANCELLED');
    const totalLines = activeItems.length;
    const totalQuantity = activeItems.reduce((sum, item) => sum + item.quantity, 0);

    const readyQuantity = activeItems
      .filter((i) => i.status === 'READY')
      .reduce((sum, item) => sum + item.quantity, 0);

    const inProgressQuantity = activeItems
      .filter((i) => i.status === 'IN_PROGRESS')
      .reduce((sum, item) => sum + item.quantity, 0);

    const sentQuantity = activeItems
      .filter((i) => i.status === 'SENT_TO_KITCHEN')
      .reduce((sum, item) => sum + item.quantity, 0);

    const newQuantity = activeItems
      .filter((i) => i.status === 'NEW')
      .reduce((sum, item) => sum + item.quantity, 0);

    const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;

    // Phần trăm hoàn thành tính dựa trên tổng số lượng món
    const percentComplete = totalQuantity > 0 ? Math.round((readyQuantity / totalQuantity) * 100) : 0;

    // Xác định giai đoạn tổng thể (Overall Stage)
    let overallStage: 'OPEN' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY_TO_CLOSE' | 'CLOSED' = 'OPEN';
    if (order.status === 'CLOSED') {
      overallStage = 'CLOSED';
    } else if (totalQuantity > 0 && readyQuantity === totalQuantity) {
      overallStage = 'READY_TO_CLOSE';
    } else if (inProgressQuantity > 0 || readyQuantity > 0) {
      overallStage = 'IN_PROGRESS';
    } else if (sentQuantity > 0) {
      overallStage = 'SENT_TO_KITCHEN';
    } else {
      overallStage = 'OPEN';
    }

    // 6. Lấy lịch sử thay đổi trạng thái (Đã khử sạch thông tin nhạy cảm của nhân viên/quản trị)
    const rawHistory = await db.query<{
      id: string;
      order_item_id: string | null;
      from_status: string;
      to_status: string;
      changed_at: string;
      item_name: string | null;
    }>(
      `SELECT 
        osh.id,
        osh.order_item_id,
        osh.from_status,
        osh.to_status,
        osh.changed_at,
        oi.item_name_snapshot as item_name
       FROM order_status_history osh
       LEFT JOIN order_items oi ON osh.order_item_id = oi.id
       WHERE osh.order_id = $1
       ORDER BY osh.changed_at ASC;`,
      [order.id]
    );

    const statusHistory = rawHistory.map((h) => ({
      id: h.id,
      itemName: h.item_name || 'Đơn hàng',
      fromStatus: h.from_status,
      toStatus: h.to_status,
      changedAt: h.changed_at,
    }));

    // 7. Sinh mã QR chuyển khoản VietQR cho khách
    // Điều kiện: Tổng tiền > 0, đơn chưa xác nhận thanh toán và chưa đóng
    let paymentQr = null;
    const isUnpaid = order.payment_status !== 'MANUALLY_CONFIRMED' && order.status !== 'CLOSED';
    if (order.total_amount > 0 && isUnpaid) {
      try {
        paymentQr = await generateOrderQrCode({
          orderCode: order.order_code,
          totalAmount: order.total_amount,
        });
      } catch (err) {
        console.error('Lỗi sinh VietQR cho khách tại bàn:', err);
      }
    }

    return NextResponse.json({
      success: true,
      hasActiveOrder: true,
      table: {
        id: order.table_id,
        tableCode: order.table_code,
        areaName: order.area_name,
      },
      order: {
        id: order.id,
        orderCode: order.order_code,
        status: order.status,
        overallStage,
        totalAmount: Number(order.total_amount || 0),
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        paymentConfirmedAt: order.payment_confirmed_at,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
      progress: {
        totalLines,
        totalQuantity,
        readyQuantity,
        inProgressQuantity,
        sentQuantity,
        newQuantity,
        cancelledCount,
        percentComplete,
      },
      items,
      history: statusHistory,
      paymentQr,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Lỗi API GET /api/guest/track:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi tra cứu tiến độ đơn hàng.' },
      { status: 500 }
    );
  }
}
