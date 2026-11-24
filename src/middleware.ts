import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'smart_rest_token';

function getEdgeJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  return new TextEncoder().encode('smart_restaurant_dev_only_secret_key_minimum_32_chars_2026');
}

const ROUTE_ROLE_RULES: Array<{ prefix: string; roles: Array<'manager' | 'waiter' | 'kitchen'> }> = [
  { prefix: '/admin', roles: ['manager'] },
  { prefix: '/reports', roles: ['manager'] },
  { prefix: '/kitchen', roles: ['kitchen', 'manager'] },
  { prefix: '/tables', roles: ['waiter', 'manager'] },
  { prefix: '/orders', roles: ['waiter', 'manager'] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const matchedRule = ROUTE_ROLE_RULES.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  );

  if (!matchedRule) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const secret = getEdgeJwtSecret();
  if (!secret) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const role = payload.role as 'manager' | 'waiter' | 'kitchen' | undefined;

    if (!role || !matchedRule.roles.includes(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/tables/:path*', '/orders/:path*', '/kitchen/:path*', '/reports/:path*', '/admin/:path*'],
};
