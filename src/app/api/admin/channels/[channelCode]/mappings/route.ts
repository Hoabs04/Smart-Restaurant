import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const db = await getDb();

    const channel = await db.queryOne<{ id: string }>(
      `SELECT id FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy kênh.' },
        { status: 404 }
      );
    }

    // Lấy danh sách mapping hiện tại
    const mappings = await db.query<{
      id: string;
      internal_menu_item_id: string;
      external_item_id: string;
      external_item_name: string;
      external_price: number;
      sync_stock: boolean;
      is_active: boolean;
      last_synced_at: string | null;
      internal_name: string;
      internal_price: number;
      stock_quantity: number;
      availability: boolean;
      category_name: string;
    }>(
      `SELECT 
        m.id,
        m.internal_menu_item_id,
        m.external_item_id,
        m.external_item_name,
        m.external_price,
        m.sync_stock,
        m.is_active,
        m.last_synced_at,
        mi.name as internal_name,
        mi.current_price as internal_price,
        mi.stock_quantity,
        mi.availability,
        c.name as category_name
       FROM channel_menu_mappings m
       JOIN menu_items mi ON m.internal_menu_item_id = mi.id
       JOIN menu_categories c ON mi.category_id = c.id
       WHERE m.channel_id = $1
       ORDER BY mi.name ASC;`,
      [channel.id]
    );

    // Lấy toàn bộ món ăn nội bộ để phục vụ modal gán món
    const internalItems = await db.query<{
      id: string;
      name: string;
      current_price: number;
      stock_quantity: number;
      availability: boolean;
      category_name: string;
    }>(
      `SELECT mi.id, mi.name, mi.current_price, mi.stock_quantity, mi.availability, c.name as category_name
       FROM menu_items mi
       JOIN menu_categories c ON mi.category_id = c.id
       ORDER BY c.sort_order ASC, mi.name ASC;`
    );

    return NextResponse.json({
      success: true,
      mappings: mappings.map(m => ({
        ...m,
        external_price: Number(m.external_price),
        internal_price: Number(m.internal_price),
        stock_quantity: Number(m.stock_quantity),
      })),
      internalItems: internalItems.map(i => ({
        ...i,
        current_price: Number(i.current_price),
        stock_quantity: Number(i.stock_quantity),
      })),
    });
  } catch (error) {
    console.error('Lỗi GET /mappings:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách mapping món.' },
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
    const body = await req.json();
    const {
      internal_menu_item_id,
      external_item_id,
      external_item_name,
      external_price,
      sync_stock = true,
    } = body;

    if (!internal_menu_item_id || !external_item_id || !external_item_name) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng điền đầy đủ món nội bộ, mã món trên sàn và tên món sàn.' },
        { status: 400 }
      );
    }

    const db = await getDb();

    const channel = await db.queryOne<{ id: string }>(
      `SELECT id FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Không tìm thấy kênh.' },
        { status: 404 }
      );
    }

    // Tra cứu giá món nội bộ nếu client không gửi giá ngoài
    const menuItem = await db.queryOne<{ current_price: number }>(
      `SELECT current_price FROM menu_items WHERE id = $1;`,
      [internal_menu_item_id]
    );

    const price = external_price !== undefined ? Number(external_price) : (menuItem ? Number(menuItem.current_price) : 0);

    const mappingId = crypto.randomUUID();

    await db.execute(
      `INSERT INTO channel_menu_mappings (
        id, channel_id, internal_menu_item_id, external_item_id,
        external_item_name, external_price, sync_stock, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (channel_id, internal_menu_item_id) DO UPDATE
      SET external_item_id = EXCLUDED.external_item_id,
          external_item_name = EXCLUDED.external_item_name,
          external_price = EXCLUDED.external_price,
          sync_stock = EXCLUDED.sync_stock,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP;`,
      [mappingId, channel.id, internal_menu_item_id, external_item_id, external_item_name, price, sync_stock]
    );

    return NextResponse.json({
      success: true,
      message: 'Đã lưu liên kết món ăn thành công.',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Lỗi POST /mappings:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: error?.message || 'Lỗi khi lưu mapping món.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { channelCode } = await context.params;
    const { searchParams } = new URL(req.url);
    const mappingId = searchParams.get('id');

    if (!mappingId) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Thiếu ID liên kết cần xóa.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    await db.execute(`DELETE FROM channel_menu_mappings WHERE id = $1;`, [mappingId]);

    return NextResponse.json({
      success: true,
      message: 'Đã xóa liên kết món ăn thành công.',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi xóa mapping món.' },
      { status: 500 }
    );
  }
}

