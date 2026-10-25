import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getStockStatusInfo } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['waiter', 'kitchen', 'manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const query = searchParams.get('q');
    const availability = searchParams.get('availability');

    const db = await getDb();

    let sql = `
      SELECT 
        m.id,
        m.category_id,
        c.name as category_name,
        m.name,
        m.description,
        m.current_price,
        m.availability,
        m.stock_quantity,
        m.low_stock_threshold,
        m.image_key
      FROM menu_items m
      JOIN menu_categories c ON m.category_id = c.id
      WHERE m.availability = true
    `;

    const params: any[] = [];

    if (category && category.trim()) {
      params.push(category.trim());
      sql += ` AND (c.id = $${params.length} OR c.name = $${params.length})`;
    }

    if (query && query.trim()) {
      params.push(`%${query.trim()}%`);
      sql += ` AND (m.name ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
    }

    if (availability === 'in_stock') {
      sql += ` AND m.stock_quantity > 0`;
    } else if (availability === 'out_of_stock') {
      sql += ` AND m.stock_quantity = 0`;
    }

    sql += ` ORDER BY c.sort_order ASC, m.name ASC;`;

    const rows = await db.query(sql, params);

    // Lấy danh sách categories
    const categories = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM menu_categories WHERE is_active = true ORDER BY sort_order ASC;`
    );

    const items = rows.map(r => {
      const stockInfo = getStockStatusInfo(r.stock_quantity, r.low_stock_threshold);
      return {
        id: r.id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        name: r.name,
        description: r.description,
        currentPrice: Number(r.current_price),
        availability: Boolean(r.availability),
        stockQuantity: Number(r.stock_quantity),
        lowStockThreshold: Number(r.low_stock_threshold),
        stockStatus: stockInfo.status,
        stockLabel: stockInfo.label,
        stockBadgeClass: stockInfo.badgeClass,
        canOrder: r.stock_quantity > 0,
        imageUrl: r.image_key || null,
      };
    });

    return NextResponse.json({
      success: true,
      data: items,
      categories: categories.map(c => ({ id: c.id, name: c.name })),
    });
  } catch (error) {
    console.error('Lỗi API GET /api/menu:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải thực đơn nhà hàng.' },
      { status: 500 }
    );
  }
}
