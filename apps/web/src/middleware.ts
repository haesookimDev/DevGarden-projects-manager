export { auth as middleware } from '@/auth';

export const config = {
  // Protect everything except: nextauth API, Next internals, static assets, signin page.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|signin).*)'],
};
