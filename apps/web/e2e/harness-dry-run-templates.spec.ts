import { expect, test } from './auth-fixture';

test('new harness page shows the template catalog grid', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new');
  const catalog = page.getByTestId('harness-template-catalog');
  await expect(catalog).toBeVisible();
  const cards = page.getByTestId('harness-template-card');
  await expect(cards).toHaveCount(2);
});

test('clicking a template card seeds the editor with template name', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new');
  await page.getByTestId('harness-template-card').first().click();
  await expect(page).toHaveURL(/\?template=auto-fix-issue$/);
  // The Name input is prefilled with the template id when opened via ?template.
  await expect(page.getByTestId('harness-editor-name')).toHaveValue('auto-fix-issue');
  // Catalog is hidden once a template is selected so the page focuses on editing.
  await expect(page.getByTestId('harness-template-catalog')).toHaveCount(0);
});

test('dry-run button populates steps + llm + tool call sections', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new');
  // Wait for validation panel to settle before triggering dry-run.
  await expect(page.getByTestId('harness-editor-validation')).toHaveAttribute(
    'data-validation-status',
    'ok',
    { timeout: 10_000 },
  );

  await page.getByTestId('harness-dry-run-button').click();
  const ok = page.getByTestId('harness-dry-run-ok');
  await expect(ok).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('harness-dry-run-step')).toHaveCount(2);
  await expect(page.getByTestId('harness-dry-run-llm-call')).toHaveCount(1);
  await expect(page.getByTestId('harness-dry-run-tool-call')).toHaveCount(1);
});
