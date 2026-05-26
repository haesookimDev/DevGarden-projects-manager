// Server-only accessor for the user's GitHub OAuth token. The token is
// stashed inside NextAuth's encrypted JWT cookie by the jwt callback in
// auth.ts and is never copied into the session object — that keeps it off
// the client. Anything that needs it (e.g. installation discovery via
// apps.listInstallationsForAuthenticatedUser) reads it through this helper.

import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';

export async function getGithubAccessToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const cookieStore = await cookies();
  const req = {
    cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
    headers: { cookie: cookieStore.toString() },
  } as unknown as Parameters<typeof getToken>[0]['req'];
  const token = await getToken({ req, secret, salt: 'authjs.session-token' });
  const v = (token as { githubAccessToken?: unknown } | null)?.githubAccessToken;
  return typeof v === 'string' && v.length > 0 ? v : null;
}
