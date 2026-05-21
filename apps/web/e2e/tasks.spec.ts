import { expect, test } from './auth-fixture';

test('dashboard exposes a Tasks CTA pointing to /dashboard/tasks', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-tasks-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/tasks');
});

test('tasks page shows unified list with source badges + counts', async ({ page }) => {
  await page.goto('/dashboard/tasks');
  await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();

  const rows = page.getByTestId('todo-row');
  await expect(rows).toHaveCount(3);

  // Source badges visible (github-issue and internal both present)
  await expect(page.locator('[data-source="GITHUB_ISSUE"]')).toHaveCount(1);
  await expect(page.locator('[data-source="INTERNAL"]')).toHaveCount(2);

  // Counts strip shows 3 total
  await expect(page.getByTestId('tasks-counts')).toContainText('3 total');
});

test('filter tabs narrow the list to a single source', async ({ page }) => {
  await page.goto('/dashboard/tasks');

  await page.getByTestId('tasks-filter-issues').click();
  await expect(page).toHaveURL(/source=GITHUB_ISSUE/);
  await expect(page.getByTestId('todo-row')).toHaveCount(1);
  await expect(page.locator('[data-source="GITHUB_ISSUE"]')).toHaveCount(1);

  await page.getByTestId('tasks-filter-internal').click();
  await expect(page).toHaveURL(/source=INTERNAL/);
  await expect(page.getByTestId('todo-row')).toHaveCount(2);
});
