import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from './lib/jwt';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get('token')?.value;

  const isAuthPage = path.startsWith('/login') || path.startsWith('/register');
  const isProtectedPage = path.startsWith('/dashboard') || path.startsWith('/documents');

  if (isProtectedPage) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    const payload = await verifyJWT(token);
    if (!payload) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      // Clear invalid token cookie
      response.cookies.delete('token');
      return response;
    }
  }

  if (isAuthPage && token) {
    const payload = await verifyJWT(token);
    if (payload) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Protect all dashboard, documents pages and intercept login/register
  matcher: ['/dashboard/:path*', '/documents/:path*', '/login', '/register'],
};
