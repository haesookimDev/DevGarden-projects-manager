import { expect, test } from './auth-fixture';

test('dashboard exposes an Insights CTA', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-insights-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/insights');
});

test('insights page renders totals + chart area + breakdown', async ({ page }) => {
  await page.goto('/dashboard/insights');
  await expect(page.getByRole('heading', { name: /insights/i })).toBeVisible();

  await expect(page.getByTestId('insights-total-cost')).toContainText('$0.0460');
  await expect(page.getByTestId('insights-total-tokens')).toContainText('4,600');
  await expect(page.getByTestId('insights-chart-area')).toBeVisible();

  // Default breakdown tab is "By project" — two rows.
  await expect(page.getByTestId('insights-breakdown-project-row')).toHaveCount(2);
});

test('breakdown tab switches to harness', async ({ page }) => {
  await page.goto('/dashboard/insights');
  await page.getByTestId('insights-tab-harness').click();
  await expect(page.getByTestId('insights-breakdown-harness')).toBeVisible();
  await expect(page.getByTestId('insights-breakdown-harness-row')).toHaveCount(1);
});

test('range selector writes ?days= to the URL', async ({ page }) => {
  await page.goto('/dashboard/insights');
  await page.getByTestId('insights-range-90').click();
  await expect(page).toHaveURL(/\/dashboard\/insights\?days=90$/);
  await expect(page.getByTestId('insights-range-90')).toHaveAttribute('data-active', '1');
});
