import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getWaitTimeSeconds, formatWaitTime, isOverdueWarning } from '@/lib/utils';

export async function GET(req: NextRequest) {
  // BẢO VỆ QUYỀN: Nhân viên bếp (kitchen), phục vụ (waiter) và quản lý (manager) đều có thể theo dõi tiến độ bếp
  const auth = await requireAuth(req, ['kitchen', 'waiter', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const db = await getDb();

    // 1. Lấy tất cả các batch có chứa ít nhất một món đang ở trạng thái SENT_TO_KITCHEN hoặc IN_PROGRESS
    // SẮP XẾP THEO sent_at TĂNG DẦN (batch gửi trước lên trước, KHÔNG dùng thời điểm tạo order)
    const batches = await db.query<{
      batch_id: string;
      batch_number: number;
      sent_at: string;
      order_id: string;
      order_code: string;
      order_source: string;
      channel_order_id: string | null;
      external_order_code: string | null;
      table_id: string | null;
      table_code: string;
      area_name: string;
      order_created_at: string;
      creator_name: string;
    }>(
      `SELECT DISTINCT
        kb.id as batch_id,
        kb.batch_number,
        kb.sent_at,
        o.id as order_id,
        o.order_code,
        o.order_source,
        o.channel_order_id,
        eo.external_order_code,
        t.id as table_id,
        COALESCE(t.table_code, o.order_source) as table_code,
        COALESCE(t.area_name, 'Đơn Giao Hàng') as area_name,
        o.created_at as order_created_at,
        COALESCE(u.display_name, 'Hệ thống') as creator_name
      FROM kitchen_batches kb
      JOIN orders o ON kb.order_id = o.id
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN external_orders eo ON o.channel_order_id = eo.id
      LEFT JOIN users u ON kb.created_by = u.id
      JOIN order_items oi ON kb.id = oi.kitchen_batch_id
      WHERE oi.status IN ('SENT_TO_KITCHEN', 'IN_PROGRESS')
      ORDER BY kb.sent_at ASC;`
    );

    if (batches.length === 0) {
      return NextResponse.json({
        success: true,
        batches: [],
        message: 'Hiện không có món nào đang chờ chế biến trong bếp.',
      });
    }

    const batchIds = batches.map(b => b.batch_id);

    // 2. Lấy danh sách món ăn tương ứng trong từng batch
    const items = await db.query<{
      id: string;
      kitchen_batch_id: string;
      menu_item_id: string;
      item_name_snapshot: string;
      quantity: number;
      status: string;
      created_at: string;
    }>(
      `SELECT 
        id,
        kitchen_batch_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        status,
        created_at
      FROM order_items
      WHERE kitchen_batch_id = ANY($1) AND status IN ('SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY')
      ORDER BY created_at ASC;`,
      [batchIds]
    );

    // Nhóm items theo batch_id
    const itemsByBatch = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByBatch.get(item.kitchen_batch_id) || [];
      list.push(item);
      itemsByBatch.set(item.kitchen_batch_id, list);
    }

    // 3. Xử lý thời gian chờ và cảnh báo quá 10 phút tính từ sent_at
    const formattedBatches = batches.map(b => {
      const waitSeconds = getWaitTimeSeconds(b.sent_at);
      const isBatchOverdue = isOverdueWarning(b.sent_at, 10);
      const batchItems = itemsByBatch.get(b.batch_id) || [];

      // Món còn ở SENT_TO_KITCHEN bị cảnh báo khi batch quá 10 phút
      const formattedItems = batchItems.map(it => {
        const isItemOverdue = it.status === 'SENT_TO_KITCHEN' && isBatchOverdue;
        return {
          id: it.id,
          itemName: it.item_name_snapshot,
          quantity: it.quantity,
          status: it.status,
          isOverdue: isItemOverdue,
          canStart: it.status === 'SENT_TO_KITCHEN',
          canReady: it.status === 'IN_PROGRESS',
        };
      });

      return {
        batchId: b.batch_id,
        batchNumber: b.batch_number,
        orderId: b.order_id,
        orderCode: b.order_code,
        tableCode: b.table_code,
        areaName: b.area_name,
        orderSource: b.order_source || 'DINE_IN',
        channelOrderCode: b.external_order_code || null,
        isDelivery: Boolean(b.order_source && b.order_source !== 'DINE_IN'),
        creatorName: b.creator_name,
        sentAt: b.sent_at,
        orderCreatedAt: b.order_created_at, // Trả về để client kiểm chứng queue KHÔNG dựa vào order_created_at
        waitTimeSeconds: waitSeconds,
        waitTimeFormatted: formatWaitTime(b.sent_at),
        isOverdue: isBatchOverdue, // Cảnh báo khi now - sent_at > 10 phút (tại 10p chưa cảnh báo)
        items: formattedItems,
      };
    });

    return NextResponse.json({
      success: true,
      totalBatches: formattedBatches.length,
      warningCount: formattedBatches.filter(b => b.isOverdue).length,
      batches: formattedBatches,
    });

  } catch (error) {
    console.error('Lỗi API GET /api/kitchen/queue:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách hàng đợi bếp.' },
      { status: 500 }
    );
  }
}
