// N5 run controls on the run detail page. The mock derives a run's status from
// its id (mock-running-* → RUNNING, mock-failed-* → FAILED, else SUCCESS).

import { expect, test } from './auth-fixture';

test('a RUNNING run shows Cancel and requests cancellation', async ({ page }) => {
  await page.goto('/dashboard/runs/mock-running-1');

  await expect(page.getByTestId('run-cancel')).toBeVisible();
  await expect(page.getByTestId('run-retry')).toHaveCount(0);

  await page.getByTestId('run-cancel').click();
  await expect(page.getByTestId('run-confirm')).toBeVisible();
  await page.getByTestId('run-confirm-yes').click();

  await expect(page.getByTestId('run-action-note')).toContainText('취소를 요청');
});

test('a FAILED run shows Retry and navigates to the new run', async ({ page }) => {
  await page.goto('/dashboard/runs/mock-failed-1');

  await expect(page.getByTestId('run-retry')).toBeVisible();
  await expect(page.getByTestId('run-cancel')).toHaveCount(0);

  await page.getByTestId('run-retry').click();
  await expect(page.getByTestId('run-confirm')).toBeVisible();
  await page.getByTestId('run-confirm-yes').click();

  await expect(page).toHaveURL(/\/dashboard\/runs\/mock-retry-1$/);
});

test('a SUCCESS run shows neither Cancel nor Retry', async ({ page }) => {
  await page.goto('/dashboard/runs/mock-success-1');
  await expect(page.getByTestId('run-cancel')).toHaveCount(0);
  await expect(page.getByTestId('run-retry')).toHaveCount(0);
});
