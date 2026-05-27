// E2E for the harness editor. Monaco lazy-loads + the zod validator
// dynamically imports harness-core, so each test waits on the validation
// status testid before asserting save-button state.

import { expect, test } from './auth-fixture';

test('new harness page renders editor + validates the starter yaml as ok', async ({ page }) => {
  await page.goto('/dashboard/harnesses/new');

  await expect(page.getByTestId('harness-editor-form')).toBeVisible();
  await expect(page.getByTestId('harness-editor-name')).toHaveValue('my-harness');

  // Monaco mounts a textarea + the editor's container div; we don't drive
  // it directly here, just verify the side panel reaches an `ok` state
  // for the starter yaml.
  const panel = page.getByTestId('harness-editor-validation');
  await expect(panel).toHaveAttribute('data-validation-status', 'ok', { timeout: 10_000 });

  const save = page.getByTestId('harness-editor-save');
  await expect(save).toBeEnabled();
});

test('editor [id] page loads saved yaml and lists every version in the sidebar', async ({
  page,
}) => {
  await page.goto('/dashboard/harnesses/mock-harness-echo-v2');

  await expect(page.getByTestId('harness-detail-name')).toHaveText('echo');

  // Mock seeds two versions of "echo" — sidebar should list both.
  const rows = page.getByTestId('harness-version-row');
  await expect(rows).toHaveCount(2);

  // Name input is locked in detail mode (editing an existing harness
  // shouldn't rename it — that would split the version timeline).
  await expect(page.getByTestId('harness-editor-name')).toHaveAttribute('readonly', '');

  await expect(page.getByTestId('harness-editor-validation')).toHaveAttribute(
    'data-validation-status',
    'ok',
    { timeout: 10_000 },
  );
});

test('viewing an older version shows the stale badge', async ({ page }) => {
  // mock-harness-1 is echo v1 — the older sibling of v2.
  await page.goto('/dashboard/harnesses/mock-harness-1');
  await expect(page.getByTestId('harness-detail-stale')).toBeVisible();
});
