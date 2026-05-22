import { expect, test } from '@playwright/test';

test.describe('auth middleware', () => {
  test('unauthenticated user is redirected from / to /signin', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test('unauthenticated user is redirected from /dashboard to /signin', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test('signin page renders Continue with GitHub button', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
  });

  test('unauthenticated user is redirected from /dashboard/projects/new to /signin', async ({
    page,
  }) => {
    await page.goto('/dashboard/projects/new');
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test('unauthenticated user is redirected from /dashboard/clients/new to /signin', async ({
    page,
  }) => {
    await page.goto('/dashboard/clients/new');
    await expect(page).toHaveURL(/\/signin(\?|$)/);
  });

  test('healthz probe bypasses auth and returns 200 ok', async ({ request }) => {
    const res = await request.get('/api/healthz');
    expect(res.status()).toBe(200);
    await expect.poll(async () => (await res.json()).status).toBe('ok');
  });
});
