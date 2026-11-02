import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';
import { getChannelProvider } from '@/lib/sales-channels/factory';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager', 'waiter', 'kitchen']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0);

    const db = await getDb();

    let sql = `
      SELECT 
        o.id,
        o.channel_id,
        o.internal_order_id,
        o.external_order_id,
        o.external_order_code,
        o.channel_code,
        o.channel_status,
        o.normalized_status,
        o.customer_name,
        o.customer_phone,
        o.delivery_address,
        o.driver_name,
        o.driver_phone,
        o.total_amount,
        o.platform_fee,
        o.net_revenue,
        o.items_json,
        o.ordered_at,
        o.created_at,
        c.name as channel_name
      FROM external_orders o
      JOIN sales_channels c ON o.channel_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    if (channelCode.toUpperCase() !== 'ALL') {
      params.push(channelCode);
      sql += ` AND UPPER(o.channel_code) = UPPER($${params.length})`;
    }

    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND o.normalized_status = $${params.length}`;
    }

    sql += ` ORDER BY o.ordered_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const rows = await db.query(sql, params);

    return NextResponse.json({
      success: true,
      orders: rows.map(r => ({
        ...r,
        total_amount: Number(r.total_amount),
        platform_fee: Number(r.platform_fee),
        net_revenue: Number(r.net_revenue),
        items: JSON.parse(r.items_json || '[]'),
      })),
    });
  } catch (error) {
    console.error('Lỗi GET /api/admin/channels/[channelCode]/orders:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách đơn hàng kênh.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const body = await req.json().catch(() => ({}));

    const provider = getChannelProvider(channelCode);
    const db = await getDb();

    // Tự động tìm món đã ánh xạ hoặc món thực đơn có sẵn để mô phỏng nhận đơn mượt mà
    let simulationItems = body.items;
    if (!simulationItems || simulationItems.length === 0) {
      const chRow = await db.queryOne<{ id: string }>(
        `SELECT id FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
        [channelCode]
      );
      if (chRow) {
        const existingMappings = await db.query<{
          internal_menu_item_id: string;
          external_item_id: string;
          external_item_name: string;
          external_price: number;
        }>(
          `SELECT internal_menu_item_id, external_item_id, external_item_name, external_price 
           FROM channel_menu_mappings 
           WHERE channel_id = $1 AND is_active = TRUE LIMIT 2;`,
          [chRow.id]
        );

        if (existingMappings.length > 0) {
          simulationItems = existingMappings.map(m => ({
            external_item_id: m.external_item_id,
            item_name: m.external_item_name,
            quantity: 1,
            price: Number(m.external_price || 50000),
            internal_menu_item_id: m.internal_menu_item_id,
          }));
        } else {
          const availableDishes = await db.query<{ id: string; name: string; current_price: number }>(
            `SELECT id, name, current_price FROM menu_items WHERE availability = TRUE LIMIT 2;`
          );
          if (availableDishes.length > 0) {
            simulationItems = availableDishes.map((d, idx) => ({
              external_item_id: `EXT-${channelCode.slice(0, 3)}-${idx + 1}`,
              item_name: d.name,
              quantity: 1,
              price: Number(d.current_price || 60000),
              internal_menu_item_id: d.id,
            }));
          }
        }
      }
    }

    if (!simulationItems || simulationItems.length === 0) {
      simulationItems = [
        { external_item_id: 'ITEM-GF-01', item_name: 'Bò Mỹ Sốt Tiêu', quantity: 2, price: 150000, notes: 'Không cay' },
        { external_item_id: 'ITEM-GF-02', item_name: 'Nước cam tươi', quantity: 2, price: 40000 },
      ];
    }

    // Chuẩn bị payload mô phỏng
    const samplePayload = {
      order_id: body.externalOrderId || `${channelCode.toUpperCase().slice(0, 3)}-${Date.now()}`,
      order_code: body.externalOrderCode || `${channelCode.toUpperCase().slice(0, 3)}-${String(Date.now()).slice(-4)}`,
      customer_name: body.customerName || 'Khách Đặt Hàng Trực Tuyến',
      customer_phone: body.customerPhone || '0912345678',
      delivery_address: body.deliveryAddress || 'Số 123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
      driver_name: body.driverName || 'Tài xế Công nghệ (Xe máy: 59P1-88888)',
      items: simulationItems,
      total_amount: body.totalAmount,
    };

    // Chuẩn hóa sang UnifiedExternalOrder
    const unifiedOrder = await provider.parseWebhookOrder(samplePayload);

    // Ingest đơn hàng vào hệ thống
    const result = await salesChannelOrderService.ingestOrder(unifiedOrder);

    return NextResponse.json({
      success: true,
      message: result.message,
      orderId: result.orderId,
      order: result.order,
      isExisting: result.isExisting,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Lỗi POST /api/admin/channels/[channelCode]/orders (Mô phỏng):', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: error?.message || 'Lỗi khi mô phỏng nhận đơn từ kênh.' },
      { status: 400 }
    );
  }
}

