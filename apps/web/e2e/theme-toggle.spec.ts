// Theme toggle is rendered as a fixed floating button by the root layout, so
// it is reachable from any route. We exercise it on the public landing page to
// avoid pulling in the auth fixture.

import { test, expect } from '@playwright/test';

test('theme toggle cycles light → dark → system and persists', async ({ page }) => {
  await page.goto('/');

  const toggle = page.getByRole('button', { name: /^Theme: / });
  await expect(toggle).toBeVisible();

  const htmlClass = () => page.evaluate(() => document.documentElement.className);

  // next-themes resolves the system theme on mount; ensure hydration finished.
  await expect.poll(htmlClass).toMatch(/\b(light|dark)\b/);

  // Click until current === 'light' to get a deterministic starting point.
  for (let i = 0; i < 3; i++) {
    const label = await toggle.getAttribute('aria-label');
    if (label?.startsWith('Theme: light.')) break;
    await toggle.click();
    await page.waitForTimeout(50);
  }
  await expect(toggle).toHaveAttribute('aria-label', /^Theme: light\. Click to switch to dark\.$/);
  await expect.poll(htmlClass).toMatch(/\blight\b/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', /^Theme: dark\. Click to switch to system\.$/);
  await expect.poll(htmlClass).toMatch(/\bdark\b/);

  await toggle.click();
  await expect(toggle).toHaveAttribute(
    'aria-label',
    /^Theme: system\. Click to switch to light\.$/,
  );

  // next-themes persists choice in localStorage under the default `theme` key.
  const stored = await page.evaluate(() => window.localStorage.getItem('theme'));
  expect(stored).toBe('system');

  // Reload and verify the selection survives.
  await page.reload();
  const toggleAfter = page.getByRole('button', { name: /^Theme: / });
  await expect(toggleAfter).toHaveAttribute(
    'aria-label',
    /^Theme: system\. Click to switch to light\.$/,
  );
});
