import { expect, test } from './auth-fixture';

test('dashboard exposes a History CTA pointing to /dashboard/runs', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-runs-history-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/runs');
});

test('runs history page renders stats grid + filtered list', async ({ page }) => {
  await page.goto('/dashboard/runs');

  await expect(page.getByRole('heading', { name: /runs history/i })).toBeVisible();

  await expect(page.getByTestId('runs-stat-total')).toContainText('5');
  await expect(page.getByTestId('runs-stat-success-rate')).toContainText('75%');
  await expect(page.getByTestId('runs-stat-cost')).toContainText('$0.0234');

  await expect(page.getByTestId('runs-filter-sidebar')).toBeVisible();
  await expect(page.getByTestId('runs-pagination-summary')).toContainText('of 2');

  const rows = page.getByTestId('runs-history-row');
  await expect(rows).toHaveCount(2);

  // Click the first row → navigate to the run detail page
  await rows.first().click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/mock-run-7/);
});

test('selecting a status filter writes the URL and narrows the list', async ({ page }) => {
  await page.goto('/dashboard/runs');
  await expect(page.getByTestId('runs-history-row')).toHaveCount(2);

  // Open the status Select and choose FAILED.
  await page.getByTestId('runs-filter-status').click();
  await page.getByRole('option', { name: 'failed' }).click();

  await expect(page).toHaveURL(/status=FAILED/);
  const rows = page.getByTestId('runs-history-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('mock-run-6');
});

test('clear button resets all filters', async ({ page }) => {
  await page.goto('/dashboard/runs?status=FAILED');
  await expect(page.getByTestId('runs-history-row')).toHaveCount(1);
  await page.getByTestId('runs-filter-clear').click();
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  await expect(page.getByTestId('runs-history-row')).toHaveCount(2);
});
