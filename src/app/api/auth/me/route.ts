import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return NextResponse.json({
      success: true,
      user: {
        id: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi khi lấy thông tin người dùng.' },
      { status: 500 }
    );
  }
}
