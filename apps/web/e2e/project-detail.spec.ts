import { expect, test } from './auth-fixture';

test('dashboard project rows link to the detail page', async ({ page }) => {
  await page.goto('/dashboard');
  const row = page.getByTestId('project-list-row').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/mock-project-1/);
});

test('project detail v2 renders header + quick actions + cards', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1');

  await expect(page.getByTestId('project-detail-name')).toHaveText('mock/repo');
  await expect(page.getByTestId('project-clone-badge-ready')).toBeVisible();

  // Quick actions row is present. With the mock seeding one preset the
  // "Run default preset" button is enabled.
  await expect(page.getByTestId('project-quick-actions')).toBeVisible();
  await expect(page.getByTestId('project-action-run-preset')).toBeEnabled();
  await expect(page.getByTestId('project-action-presets')).toBeVisible();
  await expect(page.getByTestId('project-action-clone-status')).toBeVisible();

  // 4 cards on the dashboard grid.
  await expect(page.getByTestId('project-card-runs')).toBeVisible();
  await expect(page.getByTestId('project-card-issues')).toBeVisible();
  await expect(page.getByTestId('project-card-harness')).toBeVisible();
  await expect(page.getByTestId('project-card-presets')).toBeVisible();

  // Recent runs lists mock-run-7 with a link to the detail page.
  const runLink = page.getByTestId('project-run-link').first();
  await expect(runLink).toBeVisible();
  await expect(runLink).toHaveAttribute('href', '/dashboard/runs/mock-run-7');

  // Default harness preview shows the harness name + at least one step.
  await expect(page.getByTestId('project-card-harness')).toContainText('echo');
  await expect(page.getByTestId('project-harness-steps')).toContainText('step-read');
});
