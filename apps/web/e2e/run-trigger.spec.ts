import { expect, test } from './auth-fixture';

test('authenticated user can trigger a run and lands on the run detail page', async ({ page }) => {
  await page.goto('/dashboard/runs/new');

  await expect(page.getByRole('heading', { name: /trigger a new harness run/i })).toBeVisible();

  // No "first create X" warning when all three lists are seeded by mock-server.
  await expect(page.getByTestId('run-trigger-prereq-warning')).toHaveCount(0);

  await page.locator('select[name="projectId"]').selectOption({ label: 'mock/repo' });
  await page.locator('select[name="harnessId"]').selectOption({ label: 'echo (v1)' });
  await page.locator('select[name="clientId"]').selectOption('mock-client-1');

  await page.getByTestId('run-trigger-submit').click();

  await expect(page).toHaveURL(/\/dashboard\/runs\/mock-created-run-1/);
  await expect(page.getByRole('heading', { name: /run mock-cre/i })).toBeVisible();
});

test('the dashboard exposes a New run CTA pointing to the trigger page', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-new-run-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/runs/new');
});
