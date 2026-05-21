import { test, expect } from './auth-fixture';

test('authenticated user can view a run detail page with steps and logs', async ({ page }) => {
  await page.goto('/dashboard/runs/mock-run-1');

  await expect(page.getByRole('heading', { name: /run mock-run/i })).toBeVisible();
  await expect(page.getByTestId('run-status-success').first()).toBeVisible();
  await expect(page.getByTestId('run-steps')).toBeVisible();
  await expect(page.getByTestId('run-steps')).toContainText('plan');
  await expect(page.getByTestId('run-logs')).toContainText('done');
});
