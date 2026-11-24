import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { comparePassword, signAuthToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Dummy bcrypt hash để giữ thời gian phản hồi đồng nhất khi username không tồn tại
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const body = await req.json().catch(() => null);
    const rawUsername = body?.username;
    const rawPassword = body?.password;

    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng nhập tên đăng nhập và mật khẩu hợp lệ.' },
        { status: 400 }
      );
    }

    const username = rawUsername.trim();
    const password = rawPassword;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, code: 'INVALID_INPUT', message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' },
        { status: 400 }
      );
    }

    // Giới hạn tối đa 15 lần thử đăng nhập / 5 phút theo IP + username
    const ipLimit = checkRateLimit(`login:ip:${ip}`, 30, 5 * 60 * 1000);
    const userLimit = checkRateLimit(`login:user:${ip}:${username.toLowerCase()}`, 15, 5 * 60 * 1000);
    if (!ipLimit.allowed || !userLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds);
      return NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          message: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${retryAfter} giây.`,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const db = await getDb();

    // Tìm user và vai trò của họ
    const userRow = await db.queryOne<{
      id: string;
      username: string;
      password_hash: string;
      display_name: string;
      is_active: boolean;
      role_code: 'manager' | 'waiter' | 'kitchen';
    }>(
      `SELECT u.id, u.username, u.password_hash, u.display_name, u.is_active, r.code as role_code
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.username = $1`,
      [username]
    );

    if (!userRow) {
      await comparePassword(password, DUMMY_BCRYPT_HASH);
      return NextResponse.json(
        { success: false, code: 'AUTH_FAILED', message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' },
        { status: 401 }
      );
    }

    // Kiểm tra mật khẩu trước khi kiểm tra is_active để tránh lộ trạng thái khóa tài khoản
    const isMatch = await comparePassword(password, userRow.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, code: 'AUTH_FAILED', message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' },
        { status: 401 }
      );
    }

    if (!userRow.is_active) {
      return NextResponse.json(
        { success: false, code: 'ACCOUNT_LOCKED', message: 'Tài khoản này hiện đang bị khóa. Vui lòng liên hệ quản lý.' },
        { status: 403 }
      );
    }

    // Ký JWT Token
    const token = await signAuthToken({
      userId: userRow.id,
      username: userRow.username,
      displayName: userRow.display_name,
      role: userRow.role_code,
    });

    // Ghi Audit Log
    await logAudit({
      actorId: userRow.id,
      action: 'LOGIN',
      entityType: 'AUTH',
      entityId: userRow.id,
      details: { username: userRow.username, role: userRow.role_code },
      ipAddress: ip,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Đăng nhập thành công.',
      user: {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        role: userRow.role_code,
      },
    });

    // Thiết lập HttpOnly Cookie bảo mật
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 tiếng
    });

    return response;
  } catch (error) {
    console.error('Lỗi API Login:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Đã xảy ra lỗi máy chủ trong quá trình đăng nhập.' },
      { status: 500 }
    );
  }
}
