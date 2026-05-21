// Playwright fixture that signs an authjs JWT and attaches it as the session
// cookie before the test starts. Lets us exercise auth-protected pages without
// running a full GitHub OAuth round-trip (which NextAuth refuses over HTTP).

import { test as base } from '@playwright/test';
import { encode } from '@auth/core/jwt';

const AUTH_SECRET = 'test-secret-for-e2e-runs-only-not-a-real-secret';
const COOKIE_NAME = 'authjs.session-token';

export interface AuthedUser {
  dbUserId: string;
  githubId: number;
  login: string;
  email: string;
  name: string;
}

export const DEFAULT_AUTHED_USER: AuthedUser = {
  dbUserId: 'cuid_test_user',
  githubId: 999_001,
  login: 'test-user',
  email: 'test-user@example.com',
  name: 'Test User',
};

export async function makeSessionCookieValue(user: AuthedUser): Promise<string> {
  return encode({
    token: {
      sub: user.dbUserId,
      name: user.name,
      email: user.email,
      dbUserId: user.dbUserId,
      githubId: user.githubId,
      login: user.login,
    },
    secret: AUTH_SECRET,
    salt: COOKIE_NAME,
  });
}

export const test = base.extend<{ authedUser: AuthedUser }>({
  authedUser: DEFAULT_AUTHED_USER,
  page: async ({ page, authedUser }, use) => {
    const value = await makeSessionCookieValue(authedUser);
    await page.context().addCookies([
      {
        name: COOKIE_NAME,
        value,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    await use(page);
  },
});

export { expect } from '@playwright/test';
