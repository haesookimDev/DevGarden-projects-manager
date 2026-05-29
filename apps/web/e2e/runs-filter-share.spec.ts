// N6 cross-cut: the runs filter state lives entirely in the URL, so a
// shared / bookmarked link reproduces the same filtered view on a cold load
// (no prior interaction). Complements runs-history.spec which drives the
// filter via clicks.

import { expect, test } from './auth-fixture';

test('a shared ?status= URL pre-applies the filter on cold load', async ({ page }) => {
  await page.goto('/dashboard/runs?status=FAILED');

  // The status Select reflects the URL on first paint.
  await expect(page.getByTestId('runs-filter-status')).toContainText('failed');

  // The list is already narrowed to the single FAILED run (mock honors the
  // status query) without any click.
  const rows = page.getByTestId('runs-history-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('mock-run-6');

  // Clearing returns to the unfiltered URL + full list.
  await page.getByTestId('runs-filter-clear').click();
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  await expect(page.getByTestId('runs-history-row')).toHaveCount(2);
});

test('pagination summary reflects the total match count', async ({ page }) => {
  await page.goto('/dashboard/runs');
  await expect(page.getByTestId('runs-pagination-summary')).toContainText('1–2 of 2');
  // Only one page of results → next is disabled.
  await expect(page.getByTestId('runs-pagination-next')).toBeDisabled();
  await expect(page.getByTestId('runs-pagination-prev')).toBeDisabled();
});
