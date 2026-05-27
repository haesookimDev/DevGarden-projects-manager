import { expect, test } from './auth-fixture';

test('presets page renders create form + populated preset list', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1/presets');

  await expect(page.getByTestId('presets-title')).toBeVisible();
  await expect(page.getByTestId('presets-create-card')).toBeVisible();
  await expect(page.getByTestId('presets-create-form')).toBeVisible();

  // The mock seeds one default preset.
  const rows = page.getByTestId('presets-list-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('default-run');
  await expect(rows.first()).toContainText('default');
  await expect(rows.first().getByTestId('presets-row-trigger')).toBeVisible();
  await expect(rows.first().getByTestId('presets-row-delete')).toBeVisible();
});

test('clicking Run on a preset row redirects to the new run detail page', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1/presets');
  await page.getByTestId('presets-row-trigger').click();
  await expect(page).toHaveURL('/dashboard/runs/mock-run-from-preset');
});

test('project detail v2 → Manage presets link → page', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1');
  await page.getByTestId('project-action-presets').click();
  await expect(page).toHaveURL('/dashboard/projects/mock-project-1/presets');
  await expect(page.getByTestId('presets-title')).toBeVisible();
});
