// Authenticated user issues a pairing token from /dashboard/clients/new.
// The mock api echoes a fixed token; the test asserts it appears in the page.

import { test, expect } from './auth-fixture';

test('authenticated user can issue a pairing token via the new client form', async ({ page }) => {
  await page.goto('/dashboard/clients/new');
  await expect(page.getByRole('heading', { name: /add client/i })).toBeVisible();

  await page.getByLabel(/client name/i).fill('My Test Laptop');
  await page.getByRole('button', { name: /generate pairing token/i }).click();

  const token = page.getByTestId('pairing-token');
  await expect(token).toBeVisible({ timeout: 10_000 });
  await expect(token).toContainText('mock-pairing-token-abcdef0123456789');
});
