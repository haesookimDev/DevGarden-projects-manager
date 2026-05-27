import { expect, test } from './auth-fixture';

test('dashboard exposes a Harnesses CTA pointing to /dashboard/harnesses', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-harnesses-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/harnesses');
});

test('harnesses list shows one row per name with latest version badge', async ({ page }) => {
  await page.goto('/dashboard/harnesses');

  const rows = page.getByTestId('harnesses-list-row');
  // Mock seeds two names (echo, fix-issue) — latest-only view shows 2 rows.
  await expect(rows).toHaveCount(2);
  const echoRow = rows.filter({ has: page.getByText('echo') });
  await expect(echoRow).toContainText('v2');
  const fixRow = rows.filter({ has: page.getByText('fix-issue') });
  await expect(fixRow).toContainText('v1');
});

test('history toggle expands into per-version rows grouped by name', async ({ page }) => {
  await page.goto('/dashboard/harnesses');
  await page.getByTestId('harnesses-history-toggle').click();
  await expect(page).toHaveURL(/\?history=1$/);

  const groups = page.getByTestId('harnesses-history-group');
  await expect(groups).toHaveCount(2);

  const echoGroup = groups.filter({ hasText: 'echo' });
  await expect(echoGroup).toContainText('2 versions');
  await expect(echoGroup.getByTestId('harnesses-history-row')).toHaveCount(2);
});

test('New harness CTA links to /dashboard/harnesses/new', async ({ page }) => {
  await page.goto('/dashboard/harnesses');
  const cta = page.getByTestId('harnesses-new-cta');
  await expect(cta).toHaveAttribute('href', '/dashboard/harnesses/new');
});
