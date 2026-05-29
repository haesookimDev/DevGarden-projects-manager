import { expect, test } from './auth-fixture';

test('insights page links to the budget settings', async ({ page }) => {
  await page.goto('/dashboard/insights');
  const cta = page.getByTestId('insights-budget-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/settings/budget');
});

test('budget page renders form + current-period status', async ({ page }) => {
  await page.goto('/dashboard/settings/budget');
  await expect(page.getByRole('heading', { name: /budget/i })).toBeVisible();
  await expect(page.getByTestId('budget-form')).toBeVisible();
  await expect(page.getByTestId('budget-limit')).toHaveValue('100');

  // Mock seeds a warn-threshold status.
  await expect(page.getByTestId('budget-status')).toBeVisible();
  await expect(page.getByTestId('budget-threshold-warn')).toBeVisible();
});

test('saving the budget form lands on the saved confirmation', async ({ page }) => {
  await page.goto('/dashboard/settings/budget');
  await page.getByTestId('budget-save').click();
  await expect(page).toHaveURL(/\?saved=1$/);
  await expect(page.getByTestId('budget-saved')).toBeVisible();
});
