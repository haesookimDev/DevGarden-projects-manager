import { expect, test } from './auth-fixture';

test('dashboard exposes a Webhooks CTA', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-webhooks-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/webhooks');
});

test('webhooks page lists deliveries with type badge + timestamp', async ({ page }) => {
  await page.goto('/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: /webhook deliveries/i })).toBeVisible();
  const rows = page.getByTestId('webhooks-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('push');
});

test('expanding a row lazy-loads the payload JSON', async ({ page }) => {
  await page.goto('/dashboard/webhooks');
  const first = page.getByTestId('webhooks-row').first();
  await first.getByTestId('webhooks-row-toggle').click();
  const payload = first.getByTestId('webhooks-row-payload');
  await expect(payload).toBeVisible();
  await expect(payload).toContainText('refs/heads/main');
});

test('redeliver button posts and shows the success result', async ({ page }) => {
  await page.goto('/dashboard/webhooks');
  const first = page.getByTestId('webhooks-row').first();
  await first.getByTestId('webhooks-row-redeliver').click();
  await expect(first.getByTestId('webhooks-row-redeliver-result')).toContainText('재전송 요청됨');
});
