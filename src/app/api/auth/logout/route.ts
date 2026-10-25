import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, AUTH_COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';

    if (session) {
      await logAudit({
        actorId: session.userId,
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityId: session.userId,
        details: { username: session.username },
        ipAddress: ip,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Đăng xuất thành công.',
    });

    // Xóa cookie phiên
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      httpOnly: true,
      expires: new Date(0),
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Lỗi API Logout:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi đăng xuất.' },
      { status: 500 }
    );
  }
}
