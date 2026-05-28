// Full editor save flow — the N4 acceptance: start from a template, save
// (creates a version row), and land on the saved harness's detail page with
// the version history sidebar populated.

import { expect, test } from './auth-fixture';

test('template → save lands on the saved harness detail with version history', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new?template=auto-fix-issue');

  // Template seeds the name + yaml; wait for validation to settle to `ok`
  // so the Save button enables.
  await expect(page.getByTestId('harness-editor-name')).toHaveValue('auto-fix-issue');
  await expect(page.getByTestId('harness-editor-validation')).toHaveAttribute(
    'data-validation-status',
    'ok',
    { timeout: 10_000 },
  );

  const save = page.getByTestId('harness-editor-save');
  await expect(save).toBeEnabled();
  await save.click();

  // Mock POST returns mock-harness-saved → redirect to its detail page.
  await expect(page).toHaveURL(/\/dashboard\/harnesses\/mock-harness-saved$/);
  await expect(page.getByTestId('harness-detail-name')).toBeVisible();

  // The version sidebar lists every version of the saved harness's name.
  await expect(page.getByTestId('harness-version-history')).toBeVisible();
  await expect(page.getByTestId('harness-version-row').first()).toBeVisible();
});

test('blank new harness save flow also reaches the detail page', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new');
  await expect(page.getByTestId('harness-editor-validation')).toHaveAttribute(
    'data-validation-status',
    'ok',
    { timeout: 10_000 },
  );
  await page.getByTestId('harness-editor-save').click();
  await expect(page).toHaveURL(/\/dashboard\/harnesses\/mock-harness-saved$/);
});
