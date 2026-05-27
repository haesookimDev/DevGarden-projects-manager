// /dashboard/projects/new with a GitHub App installation present. Flips the
// shared onboarding-registered toggle so mock-server returns one installation
// and two repos for the repos endpoint.

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

test.describe('project picker', () => {
  test.beforeAll(async () => {
    await setOnboardingRegistered(true);
  });
  test.afterAll(async () => {
    await setOnboardingRegistered(false);
  });

  test('renders the picker form with installation summary + repo Select', async ({ page }) => {
    await page.goto('/dashboard/projects/new');
    await expect(page.getByTestId('project-new-form')).toBeVisible();
    // Only one installation seeded — the form shows the single-install
    // summary line instead of the switcher Select.
    await expect(page.getByTestId('project-new-installation-single')).toContainText('mock-octocat');
    await expect(page.getByTestId('project-new-repo-trigger')).toBeVisible();
    await expect(page.getByTestId('project-new-submit')).toBeVisible();
  });

  test('picking a repo auto-suggests a local working directory', async ({ page }) => {
    await page.goto('/dashboard/projects/new');
    await page.getByTestId('project-new-repo-trigger').click();
    await page.getByRole('option', { name: 'mock-octocat/demo-repo' }).click();

    // RepoPicker pre-fills the localRoot input with
    // <DEFAULT_WORKSPACE_ROOT>/<slug> — DEFAULT_WORKSPACE_ROOT is /tmp/devgarden
    // unless the test env overrides DEVGARDEN_WORKSPACE_ROOT.
    const localRoot = page.locator('input[name="localRoot"]');
    await expect(localRoot).toHaveValue('/tmp/devgarden/mock-octocat-demo-repo');
  });
});
