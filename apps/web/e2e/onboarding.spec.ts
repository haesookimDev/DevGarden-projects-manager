// Coverage for /dashboard/onboarding. The first two cases exercise the
// unregistered path (mock-server's /internal/github/registrations 404s by
// default → CTA cards). The third flips the onboarding-registered toggle
// so the page falls into the post-registration branch and renders the
// installations section from N1 PR5b.

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

test('onboarding page renders the step indicator + both CTA cards', async ({ page }) => {
  await page.goto('/dashboard/onboarding');

  await expect(page.getByRole('heading', { name: /connect github/i })).toBeVisible();

  const steps = page.getByTestId('onboarding-steps').getByRole('listitem');
  await expect(steps).toHaveCount(3);

  const manifestCta = page.getByTestId('onboarding-manifest-cta');
  await expect(manifestCta).toBeVisible();
  await expect(manifestCta).toHaveAttribute('href', '/dashboard/onboarding/manifest');

  const byoCta = page.getByTestId('onboarding-byo-cta');
  await expect(byoCta).toBeVisible();
  await expect(byoCta).toHaveAttribute('href', '/dashboard/onboarding/byo');
});

test('BYO page renders the form with App ID + PEM fields + submit button', async ({ page }) => {
  await page.goto('/dashboard/onboarding/byo');
  await expect(
    page.getByRole('heading', { name: /connect an existing github app/i }),
  ).toBeVisible();
  await expect(page.getByTestId('byo-form')).toBeVisible();
  await expect(page.getByLabel(/^App ID$/)).toBeVisible();
  await expect(page.getByLabel(/^Private key/i)).toBeVisible();
  await expect(page.getByTestId('byo-submit')).toBeVisible();
});

test.describe('post-registration onboarding view', () => {
  test.beforeAll(async () => {
    await setOnboardingRegistered(true);
  });
  test.afterAll(async () => {
    await setOnboardingRegistered(false);
  });

  test('shows the connected card + installations section with the seeded install', async ({
    page,
  }) => {
    await page.goto('/dashboard/onboarding');

    // Step 1 + step 2 of the indicator should now both be in the done state.
    await expect(page.getByTestId('onboarding-registered-card')).toBeVisible();
    await expect(page.getByTestId('onboarding-installations')).toBeVisible();

    // Refresh button reachable; "Install on more" deep link uses the App slug.
    await expect(page.getByTestId('installations-refresh')).toBeVisible();
    const installMore = page.getByRole('link', { name: /install on more/i });
    await expect(installMore).toHaveAttribute(
      'href',
      'https://github.com/apps/mock-app/installations/new',
    );

    // One install card rendered with the seeded account.
    const cards = page.getByTestId('installation-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('mock-octocat');
    // Seeded permissions match REQUIRED_PERMISSIONS exactly, so no warning.
    await expect(page.getByTestId('installation-perm-warning')).toHaveCount(0);
  });
});
