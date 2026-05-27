// Exercises the authenticated dashboard flow. NextAuth refuses to perform the
// real OAuth round-trip over HTTP, so instead the auth-fixture pre-signs a JWT
// session cookie equivalent to what a successful jwt callback would produce.
// A future PR can swap this for a true OAuth dance over HTTPS.

import { test, expect, DEFAULT_AUTHED_USER } from './auth-fixture';

test('authenticated user reaches dashboard with profile info', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  await expect(page.getByText(DEFAULT_AUTHED_USER.login)).toBeVisible();
  await expect(page.getByText(String(DEFAULT_AUTHED_USER.githubId))).toBeVisible();
});

test('authenticated user can open the new project form (no installations yet)', async ({
  page,
}) => {
  // Without any GitHub App installations the form short-circuits to the
  // "go to onboarding" CTA — the picker UI itself is exercised in
  // project-picker.spec.ts under the onboarding-registered toggle.
  await page.goto('/dashboard/projects/new');
  await expect(page.getByRole('heading', { name: /add project/i })).toBeVisible();
  await expect(page.getByTestId('project-new-no-installation')).toBeVisible();
  await expect(page.getByTestId('project-new-onboarding-cta')).toHaveAttribute(
    'href',
    '/dashboard/onboarding',
  );
});

test('dashboard renders client list from api with ONLINE/OFFLINE pills', async ({ page }) => {
  await page.goto('/dashboard');
  const list = page.getByTestId('client-list');
  await expect(list).toBeVisible();
  await expect(list.getByText('Mock Laptop')).toBeVisible();
  await expect(list.getByText('Mock Server')).toBeVisible();
  await expect(page.getByTestId('status-online')).toBeVisible();
  await expect(page.getByTestId('status-offline')).toBeVisible();
});
