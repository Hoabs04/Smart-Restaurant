import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ['waiter', 'manager', 'kitchen']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { id } = await context.params;
    const db = await getDb();

    // Lấy thông tin order
    const order = await db.queryOne<{
      id: string;
      order_code: string;
      table_id: string;
      table_code: string;
      area_name: string;
      table_version: number;
      created_by: string;
      creator_name: string;
      status: string;
      total_amount: number;
      version: number;
      created_at: string;
      closed_at: string | null;
    }>(
      `SELECT 
        o.id,
        o.order_code,
        o.table_id,
        t.table_code,
        t.area_name,
        t.version as table_version,
        o.created_by,
        u.display_name as creator_name,
        o.status,
        o.total_amount,
        o.version,
        o.created_at,
        o.closed_at
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      JOIN users u ON o.created_by = u.id
      WHERE o.id = $1;`,
      [id]
    );

    if (!order) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng yêu cầu.' },
        { status: 404 }
      );
    }

    // Lấy danh sách món ăn trong order
    const items = await db.query<{
      id: string;
      menu_item_id: string;
      kitchen_batch_id: string | null;
      batch_number: number | null;
      batch_sent_at: string | null;
      item_name_snapshot: string;
      unit_price_snapshot: number;
      quantity: number;
      status: string;
      cancel_reason: string | null;
      cancelled_at: string | null;
      created_at: string;
    }>(
      `SELECT 
        oi.id,
        oi.menu_item_id,
        oi.kitchen_batch_id,
        kb.batch_number,
        kb.sent_at as batch_sent_at,
        oi.item_name_snapshot,
        oi.unit_price_snapshot,
        oi.quantity,
        oi.status,
        oi.cancel_reason,
        oi.cancelled_at,
        oi.created_at
      FROM order_items oi
      LEFT JOIN kitchen_batches kb ON oi.kitchen_batch_id = kb.id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC;`,
      [id]
    );

    // Lấy danh sách batches
    const batches = await db.query<{
      id: string;
      batch_number: number;
      sent_at: string;
      creator_name: string;
    }>(
      `SELECT 
        kb.id,
        kb.batch_number,
        kb.sent_at,
        u.display_name as creator_name
      FROM kitchen_batches kb
      JOIN users u ON kb.created_by = u.id
      WHERE kb.order_id = $1
      ORDER BY kb.batch_number ASC;`,
      [id]
    );

    // Tính toán số lượng món đang chờ gửi bếp (status = NEW)
    const newItems = items.filter(it => it.status === 'NEW');
    const sentItems = items.filter(it => it.status === 'SENT_TO_KITCHEN');
    const inProgressItems = items.filter(it => it.status === 'IN_PROGRESS');
    const readyItems = items.filter(it => it.status === 'READY');
    const cancelledItems = items.filter(it => it.status === 'CANCELLED');

    // Có thể chốt đơn khi: toàn bộ món chưa hủy đều đã READY và có ít nhất 1 món chưa hủy
    const nonCancelled = items.filter(it => it.status !== 'CANCELLED');
    const canCloseOrder = nonCancelled.length > 0 && nonCancelled.every(it => it.status === 'READY') && order.status === 'READY_TO_CLOSE';

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderCode: order.order_code,
        tableId: order.table_id,
        tableCode: order.table_code,
        areaName: order.area_name,
        tableVersion: order.table_version,
        createdBy: order.created_by,
        creatorName: order.creator_name,
        status: order.status,
        totalAmount: Number(order.total_amount),
        version: order.version,
        createdAt: order.created_at,
        closedAt: order.closed_at,
        canCloseOrder,
        summary: {
          totalItems: items.length,
          newCount: newItems.length,
          sentCount: sentItems.length,
          inProgressCount: inProgressItems.length,
          readyCount: readyItems.length,
          cancelledCount: cancelledItems.length,
        },
        items: items.map(it => ({
          id: it.id,
          menuItemId: it.menu_item_id,
          kitchenBatchId: it.kitchen_batch_id,
          batchNumber: it.batch_number,
          batchSentAt: it.batch_sent_at,
          itemName: it.item_name_snapshot,
          unitPrice: Number(it.unit_price_snapshot),
          quantity: Number(it.quantity),
          lineTotal: Number(it.unit_price_snapshot) * Number(it.quantity),
          status: it.status,
          cancelReason: it.cancel_reason,
          cancelledAt: it.cancelled_at,
          createdAt: it.created_at,
          canCancel: it.status === 'NEW' || it.status === 'SENT_TO_KITCHEN',
        })),
        batches: batches.map(b => ({
          id: b.id,
          batchNumber: b.batch_number,
          sentAt: b.sent_at,
          creatorName: b.creator_name,
        })),
      },
    });
  } catch (error) {
    console.error('Lỗi API GET /api/orders/[id]:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải chi tiết đơn hàng.' },
      { status: 500 }
    );
  }
}
