// End-to-end coverage for the N3 auto-clone flow:
//   /dashboard/projects/new (clone-on-create on)
//     → /dashboard/projects/:id/clone-status
//
// And the project detail v2 clone surfaces:
//   - CloneStatusBadge (ready, in the seeded mock)
//   - Quick action "Clone status" → status page
//   - Quick action "Manage presets" → presets page
//   - "Run as task" link on an issue → presets page with ?fromIssue=
//
// The actual clone progression (sidecar reporting CLONING → READY) is
// covered at the unit level (apps/client-runner/src/clone.spec.ts) +
// integration level (apps/api/test/integration/clone-endpoints.spec.ts);
// these e2e cases only verify the web surface stays glued together.

import { expect, test } from './auth-fixture';
import { MOCK_PORT } from './global-setup';

const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

async function setOnboardingRegistered(value: boolean) {
  const res = await fetch(`${MOCK_BASE}/mock/set-onboarding-registered`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`set-onboarding-registered failed: ${res.status}`);
}

test.describe('N3 clone flow', () => {
  test.beforeAll(async () => {
    await setOnboardingRegistered(true);
  });
  test.afterAll(async () => {
    await setOnboardingRegistered(false);
  });

  test('new project form exposes the clone-on-create section with a client picker', async ({
    page,
  }) => {
    await page.goto('/dashboard/projects/new');

    await expect(page.getByTestId('clone-on-create-section')).toBeVisible();
    // Mock seeds two clients; toggle should be enabled and unchecked by default.
    const toggle = page.getByTestId('clone-on-create-toggle');
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    await expect(page.getByTestId('clone-client-trigger')).toBeVisible();
    await expect(page.getByTestId('clone-on-create-worktrees')).toBeVisible();
  });

  test('opting in to clone-on-create lands on the clone-status page', async ({ page }) => {
    await page.goto('/dashboard/projects/new');

    await page.getByTestId('project-new-repo-trigger').click();
    await page.getByRole('option', { name: 'mock-octocat/demo-repo' }).click();

    await page.getByTestId('clone-on-create-toggle').check();
    // Default client (the first ONLINE one, which is mock-client-1) is
    // pre-selected, so we don't need to open the trigger.

    await page.getByTestId('project-new-submit').click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/mock-project-1\/clone-status$/);
    await expect(page.getByTestId('clone-status-title')).toContainText('mock/repo');
  });

  test('clone-status page renders the badge + the "Where" card', async ({ page }) => {
    await page.goto('/dashboard/projects/mock-project-1/clone-status');
    await expect(page.getByTestId('clone-status-poller')).toBeVisible();
    // Mock seeds cloneStatus = READY, so the ready badge renders + the
    // poller exposes the "Open project" link.
    await expect(page.getByTestId('clone-status-badge-ready')).toBeVisible();
    await expect(page.getByTestId('clone-status-detail-link')).toBeVisible();
  });

  test('project detail "Clone status" quick action navigates to the status page', async ({
    page,
  }) => {
    await page.goto('/dashboard/projects/mock-project-1');
    await page.getByTestId('project-action-clone-status').click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/mock-project-1\/clone-status$/);
  });

  test('"Run as task" link on an issue jumps to presets page with prefilled name', async ({
    page,
  }) => {
    await page.goto('/dashboard/projects/mock-project-1');
    const runAsTask = page.getByTestId('project-issue-run-link').first();
    await expect(runAsTask).toBeVisible();
    await runAsTask.click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/mock-project-1\/presets\?fromIssue=/);
    // Prefill: the create form's name field starts with "issue-".
    await expect(page.getByTestId('presets-create-name')).toHaveValue(/^issue-/);
  });
});
