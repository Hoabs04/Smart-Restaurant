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
    const tables = await db.query(
      `SELECT id, area_name, table_code, capacity, status, is_active, version, created_at, updated_at
       FROM dining_tables
       ORDER BY area_name ASC, table_code ASC;`
    );

    return NextResponse.json({
      success: true,
      tables,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách bàn quản trị.' },
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
    const { area_name, table_code, capacity } = body;

    if (!area_name || !table_code) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng nhập tên khu vực và mã bàn.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const id = crypto.randomUUID();
    const cap = capacity ? Math.max(1, parseInt(capacity, 10)) : 4;

    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, is_active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'AVAILABLE', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [id, area_name.trim(), table_code.trim(), cap]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'CREATE_TABLE',
      entityType: 'TABLE',
      entityId: id,
      details: { area_name, table_code, capacity: cap },
    });

    return NextResponse.json({
      success: true,
      message: `Đã thêm bàn '${table_code}' vào ${area_name} thành công.`,
      table: { id, area_name, table_code, capacity: cap, status: 'AVAILABLE' },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Lỗi API POST /api/admin/tables:', error);
    if (error.message?.includes('duplicate key') || error.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { success: false, code: 'DUPLICATE_CODE', message: 'Mã bàn này đã tồn tại trong nhà hàng.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tạo bàn ăn mới.' },
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
    const { id, area_name, table_code, capacity, status, is_active } = body;

    if (!id || !area_name || !table_code) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng cung cấp mã ID, khu vực và mã bàn.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const cap = capacity ? Math.max(1, parseInt(capacity, 10)) : 4;
    const active = is_active !== undefined ? Boolean(is_active) : true;
    const stat = status || 'AVAILABLE';

    await db.execute(
      `UPDATE dining_tables 
       SET area_name = $1, table_code = $2, capacity = $3, status = $4, is_active = $5, version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6;`,
      [area_name.trim(), table_code.trim(), cap, stat, active, id]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_TABLE',
      entityType: 'TABLE',
      entityId: id,
      details: { area_name, table_code, capacity: cap, status: stat, is_active: active },
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật bàn '${table_code}' thành công.`,
    });
  } catch (error: any) {
    console.error('Lỗi API PUT /api/admin/tables:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi cập nhật bàn ăn.' },
      { status: 500 }
    );
  }
}
