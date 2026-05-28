import { expect, test } from './auth-fixture';

test('project detail Settings quick action links to /settings', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1');
  const cta = page.getByTestId('project-action-settings');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/projects/mock-project-1/settings');
});

test('settings page renders defaults form with current selections', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1/settings');
  await expect(page.getByTestId('project-settings-title')).toBeVisible();
  await expect(page.getByTestId('project-defaults-form')).toBeVisible();
  // The form should render all three select triggers.
  await expect(page.getByTestId('defaults-harness-trigger')).toBeVisible();
  await expect(page.getByTestId('defaults-version-trigger')).toBeVisible();
  await expect(page.getByTestId('defaults-client-trigger')).toBeVisible();
});

test('saving the defaults form lands on the saved confirmation', async ({ page }) => {
  await page.goto('/dashboard/projects/mock-project-1/settings');
  await page.getByTestId('project-defaults-save').click();
  await expect(page).toHaveURL(/\?saved=1$/);
  await expect(page.getByTestId('project-settings-saved')).toBeVisible();
});
