// Real NextAuth OAuth round-trip against the in-process mock GitHub.
//
// Most e2e specs short-circuit the auth dance via the cookie-injection
// fixture (e2e/auth-fixture.ts) so they stay fast. This spec is dedicated to
// exercising the full flow — /signin → /login/oauth/authorize (mock) →
// /api/auth/callback/github → /user (mock) → allow-list check → session
// cookie set → /dashboard — so callback / signIn / allow-list regressions
// surface on PR-time CI instead of after release.

import { test, expect } from '@playwright/test';
import { MOCK_PORT } from './global-setup';

const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

async function setMockOAuthLogin(login: string): Promise<void> {
  const res = await fetch(`${MOCK_BASE}/mock/set-oauth-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login }),
  });
  if (!res.ok) throw new Error(`set-oauth-login failed: ${res.status}`);
}

async function resetMockOAuthState(): Promise<void> {
  const res = await fetch(`${MOCK_BASE}/mock/reset-oauth-state`, { method: 'POST' });
  if (!res.ok) throw new Error(`reset-oauth-state failed: ${res.status}`);
}

test.afterEach(async () => {
  await resetMockOAuthState();
});

test('happy path: signin → mock authorize → callback → /dashboard with session cookie', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();

  // Submitting the form fires the server action which calls NextAuth's
  // signIn('github'). NextAuth redirects to the (mock) authorize URL which
  // immediately bounces back to /api/auth/callback/github with code+state.
  await page.getByRole('button', { name: /continue with github/i }).click();

  await expect(page).toHaveURL(/\/dashboard(?:$|\/|\?)/, { timeout: 15_000 });

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'authjs.session-token');
  expect(session, 'authjs session-token cookie should be set').toBeTruthy();
  expect(session?.value.length).toBeGreaterThan(20);
});

test('denied user lands on /signin?error=AccessDenied (allow-list rejection)', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  // The default OWNER_GITHUB_LOGINS env (playwright.config.ts) lists
  // "test-user" only; flipping the mock /user login to "denied-user" makes
  // the NextAuth signIn callback's allow-list check return false.
  await setMockOAuthLogin('denied-user');

  await page.goto('/signin');
  await page.getByRole('button', { name: /continue with github/i }).click();

  await expect(page).toHaveURL(/\/signin.*error=AccessDenied/i, { timeout: 15_000 });
  await expect(page.getByText(/허용 목록에 없습니다|access denied/i)).toBeVisible();

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'authjs.session-token');
  expect(session, 'no session cookie should be set on denial').toBeUndefined();
});
