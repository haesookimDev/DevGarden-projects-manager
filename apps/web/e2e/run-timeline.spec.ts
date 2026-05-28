import { expect, test } from './auth-fixture';

test('run detail has a Timeline tab that renders the Gantt', async ({ page }) => {
  await page.goto('/dashboard/runs/mock-run-7');

  // Default tab is Steps & logs.
  await expect(page.getByTestId('run-tab-detail')).toHaveAttribute('data-active', '1');
  await expect(page.getByTestId('run-tabs')).toBeVisible();

  // Switch to Timeline.
  await page.getByTestId('run-tab-timeline').click();
  await expect(page.getByTestId('run-tab-timeline')).toHaveAttribute('data-active', '1');

  const timeline = page.getByTestId('run-timeline');
  await expect(timeline).toBeVisible();
  await expect(page.getByTestId('run-timeline-row')).toHaveCount(2);

  // The longest step (#1 think) is flagged.
  await expect(page.getByTestId('run-timeline-longest')).toContainText('#1');
  const longest = page.getByTestId('run-timeline-row').filter({ hasText: 'think' });
  await expect(longest).toHaveAttribute('data-longest', '1');
});
