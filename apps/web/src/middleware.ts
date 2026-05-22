import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export default auth((req) => {
  if (req.auth) return;

  const signInUrl = new URL('/signin', req.nextUrl.origin);
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  // Protect everything except: nextauth API, the healthz probe, Next internals,
  // static assets, and the signin page itself.
  matcher: ['/((?!api/auth|api/healthz|_next/static|_next/image|favicon.ico|signin).*)'],
};
