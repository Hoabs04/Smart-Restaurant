import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hashPassword } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let whereClause = '';
    if (status === 'active') {
      whereClause = 'WHERE u.is_active = true';
    } else if (status === 'resigned' || status === 'inactive') {
      whereClause = 'WHERE u.is_active = false';
    }

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
      ${whereClause}
      ORDER BY u.created_at DESC;`
    );

    const roles = await db.query(`SELECT id, code, name FROM roles ORDER BY code ASC;`);

    // Thống kê nhân sự
    const statsRow = await db.queryOne<{
      total: string | number;
      active: string | number;
      resigned: string | number;
    }>(
      `SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN is_active THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END), 0) as resigned
       FROM users;`
    );

    return NextResponse.json({
      success: true,
      users,
      roles,
      stats: {
        total: Number(statsRow?.total || 0),
        active: Number(statsRow?.active || 0),
        resigned: Number(statsRow?.resigned || 0),
      },
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

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const actor = auth.user;

  try {
    // Lấy id từ query param (?id=...) hoặc từ request body
    const { searchParams } = new URL(req.url);
    let targetId = searchParams.get('id');

    if (!targetId) {
      try {
        const body = await req.json();
        targetId = body.id;
      } catch {}
    }

    if (!targetId) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng cung cấp mã ID người dùng cần xóa.' },
        { status: 400 }
      );
    }

    // 1. Không cho phép tự xóa tài khoản của chính mình
    if (actor.userId === targetId) {
      return NextResponse.json(
        { success: false, code: 'CANNOT_DELETE_SELF', message: 'Bạn không thể tự xóa tài khoản của chính mình.' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 2. Kiểm tra tài khoản tồn tại
    const targetUser = await db.queryOne<{
      id: string;
      username: string;
      display_name: string;
      is_active: boolean;
      role_code: string;
      role_name: string;
    }>(
      `SELECT u.id, u.username, u.display_name, u.is_active, r.code as role_code, r.name as role_name
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1;`,
      [targetId]
    );

    if (!targetUser) {
      return NextResponse.json(
        { success: false, code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản người dùng.' },
        { status: 404 }
      );
    }

    // 3. Nếu là tài khoản Quản lý, kiểm tra xem còn ít nhất 1 Quản lý đang hoạt động khác không
    if (targetUser.role_code === 'manager') {
      const activeManagerCountRow = await db.queryOne<{ count: string | number }>(
        `SELECT COUNT(*) as count 
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.code = 'manager' AND u.is_active = true AND u.id != $1;`,
        [targetId]
      );
      const remainingManagers = Number(activeManagerCountRow?.count || 0);
      if (remainingManagers === 0) {
        return NextResponse.json(
          { success: false, code: 'LAST_MANAGER', message: 'Không thể xóa hoặc vô hiệu hóa Quản lý duy nhất đang hoạt động trong hệ thống.' },
          { status: 400 }
        );
      }
    }

    // 4. Kiểm tra các ràng buộc dữ liệu lịch sử
    const refRow = await db.queryOne<{
      orders_count: string | number;
      batches_count: string | number;
      ledger_count: string | number;
      history_count: string | number;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM orders WHERE created_by = $1 OR payment_confirmed_by = $1) as orders_count,
        (SELECT COUNT(*) FROM kitchen_batches WHERE created_by = $1) as batches_count,
        (SELECT COUNT(*) FROM inventory_ledger WHERE actor_id = $1) as ledger_count,
        (SELECT COUNT(*) FROM order_status_history WHERE changed_by = $1) as history_count;`,
      [targetId]
    );

    const ordersCount = Number(refRow?.orders_count || 0);
    const batchesCount = Number(refRow?.batches_count || 0);
    const ledgerCount = Number(refRow?.ledger_count || 0);
    const historyCount = Number(refRow?.history_count || 0);
    const hasHistoricalRecords = (ordersCount + batchesCount + ledgerCount + historyCount) > 0;

    let deletionType: 'HARD_DELETE' | 'SOFT_DELETE' = 'HARD_DELETE';
    let responseMessage = '';

    if (!hasHistoricalRecords) {
      // Chưa có dữ liệu ràng buộc -> Xóa cứng hoàn toàn khỏi CSDL
      await db.execute(`DELETE FROM user_roles WHERE user_id = $1;`, [targetId]);
      await db.execute(`DELETE FROM users WHERE id = $1;`, [targetId]);
      deletionType = 'HARD_DELETE';
      responseMessage = `Đã xóa hoàn toàn tài khoản '@${targetUser.username}' (${targetUser.display_name}) khỏi hệ thống.`;
    } else {
      // Đã có dữ liệu ràng buộc -> Vô hiệu hóa vĩnh viễn (Đã nghỉ việc), đổi password hash ngẫu nhiên không thể đăng nhập
      const disabledPasswordHash = '!DISABLED!' + crypto.randomUUID();
      await db.execute(
        `UPDATE users 
         SET is_active = false, 
             password_hash = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2;`,
        [disabledPasswordHash, targetId]
      );
      deletionType = 'SOFT_DELETE';
      responseMessage = `Tài khoản '@${targetUser.username}' đã có lịch sử nghiệp vụ (${ordersCount} đơn hàng, ${batchesCount} mẻ chuyển bếp). Hệ thống đã vô hiệu hóa vĩnh viễn và chuyển sang trạng thái 'Đã nghỉ việc' để bảo toàn dữ liệu kế toán & kiểm toán.`;
    }

    // 5. Ghi Audit Log
    await logAudit({
      actorId: actor.userId,
      action: 'DELETE_USER',
      entityType: 'USER',
      entityId: targetId,
      details: {
        username: targetUser.username,
        displayName: targetUser.display_name,
        role: targetUser.role_code,
        deletionType,
        records: {
          ordersCount,
          batchesCount,
          ledgerCount,
          historyCount,
        },
        reason: 'Xóa tài khoản nhân viên không còn làm việc',
      },
    });

    return NextResponse.json({
      success: true,
      deletionType,
      message: responseMessage,
      user: {
        id: targetId,
        username: targetUser.username,
        display_name: targetUser.display_name,
        is_active: false,
      },
    });
  } catch (error: any) {
    console.error('Lỗi API DELETE /api/admin/users:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi xóa tài khoản nhân viên.' },
      { status: 500 }
    );
  }
}
