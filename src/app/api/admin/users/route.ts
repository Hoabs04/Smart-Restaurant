import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hashPassword } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const db = await getDb();
    const users = await db.query(
      `SELECT 
        u.id,
        u.username,
        u.display_name,
        u.is_active,
        r.code as role_code,
        r.name as role_name,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      ORDER BY u.created_at DESC;`
    );

    const roles = await db.query(`SELECT id, code, name FROM roles ORDER BY code ASC;`);

    return NextResponse.json({
      success: true,
      users,
      roles,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tải danh sách người dùng.' },
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
    const { username, password, display_name, role_code } = body;

    if (!username || !password || !display_name || !role_code) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng điền đầy đủ tên đăng nhập, mật khẩu, tên hiển thị và vai trò.' },
        { status: 400 }
      );
    }

    if (!['manager', 'waiter', 'kitchen'].includes(role_code)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_ROLE', message: 'Vai trò chỉ có thể là manager, waiter hoặc kitchen.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const role = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = $1;`, [role_code]);
    if (!role) {
      return NextResponse.json(
        { success: false, code: 'ROLE_NOT_FOUND', message: 'Vai trò không hợp lệ.' },
        { status: 400 }
      );
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db.execute(
      `INSERT INTO users (id, username, password_hash, display_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [userId, username.trim(), passwordHash, display_name.trim()]
    );

    await db.execute(
      `INSERT INTO user_roles (id, user_id, role_id)
       VALUES ($1, $2, $3);`,
      [crypto.randomUUID(), userId, role.id]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: userId,
      details: { username: username.trim(), displayName: display_name.trim(), role: role_code },
    });

    return NextResponse.json({
      success: true,
      message: `Đã tạo tài khoản '${username}' thành công.`,
      user: { id: userId, username, displayName: display_name, role: role_code },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Lỗi API POST /api/admin/users:', error);
    if (error.message?.includes('duplicate key') || error.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { success: false, code: 'DUPLICATE_USERNAME', message: 'Tên đăng nhập này đã được sử dụng.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi tạo tài khoản người dùng.' },
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
    const { id, display_name, role_code, is_active, password } = body;

    if (!id || !display_name || !role_code) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng cung cấp đầy đủ thông tin cần cập nhật.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const role = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = $1;`, [role_code]);
    if (!role) {
      return NextResponse.json(
        { success: false, code: 'ROLE_NOT_FOUND', message: 'Vai trò không hợp lệ.' },
        { status: 400 }
      );
    }

    // Cập nhật thông tin cơ bản
    const active = is_active !== undefined ? Boolean(is_active) : true;
    if (password && password.trim()) {
      const passwordHash = await hashPassword(password.trim());
      await db.execute(
        `UPDATE users 
         SET display_name = $1, is_active = $2, password_hash = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4;`,
        [display_name.trim(), active, passwordHash, id]
      );
    } else {
      await db.execute(
        `UPDATE users 
         SET display_name = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [display_name.trim(), active, id]
      );
    }

    // Cập nhật vai trò
    await db.execute(`DELETE FROM user_roles WHERE user_id = $1;`, [id]);
    await db.execute(
      `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
      [crypto.randomUUID(), id, role.id]
    );

    await logAudit({
      actorId: actor.userId,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: id,
      details: { displayName: display_name.trim(), role: role_code, isActive: active },
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật thông tin tài khoản thành công.`,
    });
  } catch (error: any) {
    console.error('Lỗi API PUT /api/admin/users:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi cập nhật tài khoản.' },
      { status: 500 }
    );
  }
}
