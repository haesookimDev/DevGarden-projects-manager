import { expect, test } from './auth-fixture';

test('dashboard links to the notifications settings', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-settings-notifications-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/settings/notifications');
});

test('notifications page renders channels + triggers reflecting settings', async ({ page }) => {
  await page.goto('/dashboard/settings/notifications');
  await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();
  await expect(page.getByTestId('notif-form')).toBeVisible();

  // Mock seeds web-toast on, failed-only triggers.
  await expect(page.getByTestId('notif-webtoast')).toBeChecked();
  await expect(page.getByTestId('notif-trigger-failed')).toBeChecked();
  await expect(page.getByTestId('notif-trigger-success')).not.toBeChecked();

  // Recent inbox shows the seeded failed-run notification.
  await expect(page.getByTestId('notif-recent-item')).toHaveCount(1);
});

test('saving settings lands on the saved confirmation', async ({ page }) => {
  await page.goto('/dashboard/settings/notifications');
  await page.getByTestId('notif-trigger-success').check();
  await page.getByTestId('notif-save').click();
  await expect(page).toHaveURL(/\?saved=1$/);
  await expect(page.getByTestId('notif-saved')).toBeVisible();
});

test('send test notification lands on the test confirmation', async ({ page }) => {
  await page.goto('/dashboard/settings/notifications');
  await page.getByTestId('notif-test').click();
  await expect(page).toHaveURL(/\?test=sent$/);
  await expect(page.getByTestId('notif-test-sent')).toBeVisible();
});
