// The global dashboard toaster subscribes to /api/notifications/stream (SSE,
// proxied to the api). The mock only streams a notification when the toggle is
// on, so this spec opts in then resets it to keep other specs quiet.

import { MOCK_PORT } from './global-setup';
import { expect, test } from './auth-fixture';

const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

async function setStream(value: boolean) {
  const res = await fetch(`${MOCK_BASE}/mock/set-stream-notification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`set-stream-notification failed: ${res.status}`);
}

test.afterEach(async () => {
  await setStream(false);
});

test('shows a toast when a notification streams in over SSE', async ({ page }) => {
  await setStream(true);

  await page.goto('/dashboard');

  const toast = page.getByTestId('toast');
  await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  await expect(toast.first()).toContainText('Run failed');

  // Dismiss removes it.
  await page.getByTestId('toast-dismiss').first().click();
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
