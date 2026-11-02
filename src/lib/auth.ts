import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from './db';
import fs from 'fs';
import path from 'path';

function loadEnvIfMissing() {
  if (process.env.JWT_SECRET) return;
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch {}
}

let cachedJwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (cachedJwtSecret) return cachedJwtSecret;
  loadEnvIfMissing();
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production. Application halted to prevent unauthorized access.'
      );
    }
    // Trong môi trường dev/test, nếu chưa có thì cảnh báo và nạp từ biến môi trường mặc định an toàn
    console.warn('⚠️ CẢNH BÁO: Chưa cấu hình JWT_SECRET trong .env. Sử dụng khóa tạm cho môi trường phát triển.');
    cachedJwtSecret = new TextEncoder().encode('smart_restaurant_dev_only_secret_key_minimum_32_chars_2026');
    return cachedJwtSecret;
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET must be at least 32 characters long in production.');
  }
  cachedJwtSecret = new TextEncoder().encode(secret);
  return cachedJwtSecret;
}

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
    .sign(getJwtSecret());
}

/**
 * Xác thực token JWT
 */
export async function verifyAuthToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
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

  // Xác thực tính hợp lệ của tài khoản trong CSDL (chống stale session khi reset DB hoặc xóa tài khoản)
  try {
    const db = await getDb();
    let dbUser = await db.queryOne<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM users WHERE id = $1;`,
      [user.userId]
    );

    // Nếu không tìm thấy theo userId (ví dụ DB vừa được re-seed trong dev), thử fallback theo username nếu khớp
    if (!dbUser && user.username) {
      const fallbackUser = await db.queryOne<{ id: string; is_active: boolean }>(
        `SELECT id, is_active FROM users WHERE username = $1;`,
        [user.username]
      );
      if (fallbackUser) {
        user.userId = fallbackUser.id;
        dbUser = fallbackUser;
      }
    }

    if (!dbUser || dbUser.is_active === false) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        ),
      };
    }
  } catch (err) {
    // Không làm gián đoạn nếu là môi trường đặc thù chưa sẵn sàng kết nối DB
  }

  return { user };
}
