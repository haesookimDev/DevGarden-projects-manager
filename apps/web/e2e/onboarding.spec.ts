// Minimal coverage for the new /dashboard/onboarding entry. The mock-server
// has no /internal/github/registrations endpoint yet — the getRegistration
// call returns null (404) and the page renders the two CTAs.
//
// Step 2/3 are inert placeholders in this PR (N1 PR5); they get teeth in
// the follow-up PR that wires the installations picker.

import { expect, test } from './auth-fixture';

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
