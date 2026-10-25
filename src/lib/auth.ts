import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'smart_restaurant_jwt_super_secret_key_change_in_production_2026'
);

export interface TokenPayload {
  userId: string;
  username: string;
  displayName: string;
  role: 'manager' | 'waiter' | 'kitchen';
  iat?: number;
  exp?: number;
}

export const AUTH_COOKIE_NAME = 'smart_rest_token';

/**
 * Tạo token JWT ký bảo mật
 */
export async function signAuthToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Xác thực token JWT
 */
export async function verifyAuthToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Băm mật khẩu an toàn bằng bcrypt với salt rounds = 10
 */
export async function hashPassword(plainText: string): Promise<string> {
  return await bcrypt.hash(plainText, 10);
}

/**
 * So khớp mật khẩu
 */
export async function comparePassword(plainText: string, hashed: string): Promise<boolean> {
  return await bcrypt.compare(plainText, hashed);
}

/**
 * Lấy thông tin phiên người dùng hiện tại từ Request Cookies hoặc Header
 */
export async function getSessionUser(req?: NextRequest): Promise<TokenPayload | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    }
  } else {
    // Next.js Server Components / Actions
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    } catch {
      // Fallback
    }
  }

  if (!token) return null;
  return await verifyAuthToken(token);
}

/**
 * Middleware kiểm tra phân quyền chặt chẽ trên Backend API
 * Trả về thông tin User nếu hợp lệ, hoặc trả về NextResponse báo lỗi 401/403
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: Array<'manager' | 'waiter' | 'kitchen'>
): Promise<{ user: TokenPayload } | { errorResponse: NextResponse }> {
  const user = await getSessionUser(req);

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
        },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN',
          message: `Tài khoản với vai trò '${user.role}' không có quyền thực hiện thao tác này.`,
        },
        { status: 403 }
      ),
    };
  }

  return { user };
}
