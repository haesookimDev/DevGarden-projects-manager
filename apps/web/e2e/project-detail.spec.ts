import { expect, test } from './auth-fixture';

test('dashboard project rows link to the detail page', async ({ page }) => {
  await page.goto('/dashboard');
  const row = page.getByTestId('project-list-row').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/mock-project-1/);
});

test('project detail page renders config + stats + last-run link', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1');

  await expect(page.getByTestId('project-detail-name')).toHaveText('mock/repo');
  await expect(page.getByTestId('project-stat-runs')).toContainText('3');
  await expect(page.getByTestId('project-stat-last-run')).toContainText('success');
  await expect(page.getByTestId('project-stat-last-event')).toContainText('push');

  const runLink = page.getByTestId('project-last-run-link');
  await expect(runLink).toBeVisible();
  await expect(runLink).toHaveAttribute('href', '/dashboard/runs/mock-run-7');
});
