import { expect, test, type Page } from './auth-fixture';

// The form now uses Radix Select (a custom combobox) instead of native <select>,
// so Playwright's selectOption() no longer applies. The interaction pattern is:
// click the trigger, then click the option rendered into Radix' portal.
async function chooseSelectOption(page: Page, triggerTestId: string, optionLabel: string) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionLabel }).click();
}

test('authenticated user can trigger a run and lands on the run detail page', async ({ page }) => {
  await page.goto('/dashboard/runs/new');

  await expect(page.getByRole('heading', { name: /trigger a new harness run/i })).toBeVisible();

  // No "first create X" warning when all three lists are seeded by mock-server.
  await expect(page.getByTestId('run-trigger-prereq-warning')).toHaveCount(0);

  await chooseSelectOption(page, 'run-trigger-project-trigger', 'mock/repo');
  await chooseSelectOption(page, 'run-trigger-harness-trigger', 'echo (v1)');
  await chooseSelectOption(page, 'run-trigger-client-trigger', 'Mock Laptop (online)');

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
