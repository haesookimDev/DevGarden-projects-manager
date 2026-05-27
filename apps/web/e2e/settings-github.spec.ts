// Settings page for the connected GitHub App. Two states:
//   - no registration → EmptyState + onboarding CTA (default mock).
//   - registration present → connected card + installations section reused
//     from /dashboard/onboarding, but redirecting back to /settings/github.

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

test('dashboard exposes a GitHub settings CTA pointing to the new page', async ({ page }) => {
  await page.goto('/dashboard');
  const cta = page.getByTestId('dashboard-settings-github-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/dashboard/settings/github');
});

test('settings page shows the no-registration EmptyState when nothing is connected', async ({
  page,
}) => {
  await page.goto('/dashboard/settings/github');
  await expect(page.getByRole('heading', { name: /github settings/i })).toBeVisible();
  await expect(page.getByTestId('settings-github-no-registration')).toBeVisible();
  await expect(page.getByTestId('settings-github-onboarding-cta')).toHaveAttribute(
    'href',
    '/dashboard/onboarding',
  );
});

test.describe('settings with a registration', () => {
  test.beforeAll(async () => {
    await setOnboardingRegistered(true);
  });
  test.afterAll(async () => {
    await setOnboardingRegistered(false);
  });

  test('renders the connected card + installations section with redirect back to settings', async ({
    page,
  }) => {
    await page.goto('/dashboard/settings/github');
    await expect(page.getByTestId('settings-github-registered-card')).toBeVisible();

    // Installations section reused from onboarding.
    await expect(page.getByTestId('onboarding-installations')).toBeVisible();
    await expect(page.getByTestId('installation-card')).toHaveCount(1);

    // Re-run onboarding link present.
    await expect(page.getByTestId('settings-github-re-onboard')).toHaveAttribute(
      'href',
      '/dashboard/onboarding',
    );

    // The refresh form should carry a hidden redirectPath input pointing at
    // the settings page (not the onboarding page) so the action redirects
    // back here.
    const redirectPathInput = page.locator(
      'form input[name="redirectPath"][value="/dashboard/settings/github"]',
    );
    await expect(redirectPathInput).toHaveCount(1);
  });
});
