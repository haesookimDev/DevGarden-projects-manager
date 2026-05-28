// Empty-state rendering across the dashboard.
//
// The mock-server seeds every list endpoint with one or more rows by default;
// to exercise the empty path we flip a process-wide `emptyFixtures` flag via
// `POST /mock/set-empty`. fullyParallel:false + workers:1 in playwright.config
// keeps that shared toggle safe.

import { MOCK_PORT } from './global-setup';
import { test, expect } from './auth-fixture';

const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

async function setEmpty(value: boolean) {
  const res = await fetch(`${MOCK_BASE}/mock/set-empty`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`set-empty failed: ${res.status}`);
}

test.beforeEach(async () => {
  await setEmpty(true);
});
test.afterEach(async () => {
  await setEmpty(false);
});

test('dashboard root renders empty states for both projects and clients', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-projects-empty')).toBeVisible();
  await expect(page.getByTestId('dashboard-projects-empty')).toContainText(
    '등록된 프로젝트가 없습니다',
  );
  await expect(page.getByTestId('dashboard-clients-empty')).toBeVisible();
  await expect(page.getByTestId('dashboard-clients-empty')).toContainText(
    '등록된 클라이언트가 없습니다',
  );
});

test('runs history shows EmptyState with a "Trigger a new run" CTA', async ({ page }) => {
  await page.goto('/dashboard/runs');
  const empty = page.getByTestId('runs-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('일치하는 run 이 없습니다');
  const cta = page.getByTestId('runs-empty-new-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/runs/new');
});

test('tasks page shows EmptyState that adapts to the active filter', async ({ page }) => {
  await page.goto('/dashboard/tasks');
  await expect(page.getByTestId('tasks-empty')).toContainText('Task 가 없습니다');

  await page.goto('/dashboard/tasks?source=GITHUB_ISSUE');
  await expect(page.getByTestId('tasks-empty')).toContainText('필터에 맞는 task 가 없습니다');
});
