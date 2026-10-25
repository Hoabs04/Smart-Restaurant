import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const db = await getDb();
    const items = await db.query(
      `SELECT 
        m.id,
        m.category_id,
        c.name as category_name,
        m.name,
        m.description,
        m.current_price,
        m.availability,
        m.stock_quantity,
        m.low_stock_threshold,
        m.image_key,
        m.created_at,
        m.updated_at
      FROM menu_items m
      JOIN menu_categories c ON m.category_id = c.id
      ORDER BY c.sort_order ASC, m.name ASC;`
    );

    const categories = await db.query(
      `SELECT id, name, sort_order FROM menu_categories ORDER BY sort_order ASC;`
    );

    return NextResponse.json({
      success: true,
      items: items.map(i => ({
        ...i,
        current_price: Number(i.current_price),
        stock_quantity: Number(i.stock_quantity),
        low_stock_threshold: Number(i.low_stock_threshold),
      })),
      categories,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách món ăn.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const body = await req.json();
    const { category_id, name, description, current_price, stock_quantity, low_stock_threshold, image_key } = body;

    if (!category_id || !name || current_price === undefined || current_price < 0) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng cung cấp danh mục, tên món và giá hợp lệ.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const id = crypto.randomUUID();
    const stock = stock_quantity !== undefined ? Math.max(0, parseInt(stock_quantity, 10)) : 10;
    const threshold = low_stock_threshold !== undefined ? Math.max(1, parseInt(low_stock_threshold, 10)) : 5;

    await db.execute(
      `INSERT INTO menu_items (
        id, category_id, name, description, current_price, availability, stock_quantity, low_stock_threshold, image_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [id, category_id, name.trim(), description?.trim() || null, current_price, stock > 0, stock, threshold, image_key?.trim() || null]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'CREATE_MENU_ITEM',
      entityType: 'MENU_ITEM',
      entityId: id,
      details: { name: name.trim(), price: current_price, stock },
    });

    return NextResponse.json({
      success: true,
      message: `Đã thêm món '${name}' vào thực đơn thành công.`,
      item: { id, name, current_price, stock_quantity: stock, low_stock_threshold: threshold, image_key },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Lỗi API POST /api/admin/menu-items:', error);
    if (error.message?.includes('duplicate key') || error.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { success: false, code: 'DUPLICATE_NAME', message: 'Tên món ăn đã tồn tại trên thực đơn.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tạo món ăn mới.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    const body = await req.json();
    const { id, category_id, name, description, current_price, stock_quantity, low_stock_threshold, availability, image_key } = body;

    if (!id || !name || current_price === undefined || current_price < 0) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Thiếu mã món, tên món hoặc giá hợp lệ.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const stock = stock_quantity !== undefined ? Math.max(0, parseInt(stock_quantity, 10)) : 0;
    const threshold = low_stock_threshold !== undefined ? Math.max(1, parseInt(low_stock_threshold, 10)) : 5;
    const isAvail = availability !== undefined ? Boolean(availability) : stock > 0;

    await db.execute(
      `UPDATE menu_items 
       SET category_id = $1, name = $2, description = $3, current_price = $4, stock_quantity = $5, low_stock_threshold = $6, availability = $7, image_key = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9;`,
      [category_id, name.trim(), description?.trim() || null, current_price, stock, threshold, isAvail, image_key?.trim() || null, id]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_MENU_ITEM',
      entityType: 'MENU_ITEM',
      entityId: id,
      details: { name: name.trim(), price: current_price, stock, threshold, isAvail },
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật món '${name}' thành công.`,
    });
  } catch (error: any) {
    console.error('Lỗi API PUT /api/admin/menu-items:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi cập nhật món ăn.' },
      { status: 500 }
    );
  }
}
