import { expect, test } from './auth-fixture';

test('dashboard exposes a History CTA pointing to /dashboard/runs', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-runs-history-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/runs');
});

test('runs history page renders stats grid + recent runs list', async ({ page }) => {
  await page.goto('/dashboard/runs');

  await expect(page.getByRole('heading', { name: /runs history/i })).toBeVisible();

  await expect(page.getByTestId('runs-stat-total')).toContainText('5');
  await expect(page.getByTestId('runs-stat-success-rate')).toContainText('75%');
  await expect(page.getByTestId('runs-stat-cost')).toContainText('$0.0234');

  const rows = page.getByTestId('runs-history-row');
  await expect(rows).toHaveCount(2);

  // Click the first row → navigate to the run detail page
  await rows.first().click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/mock-run-7/);
});
