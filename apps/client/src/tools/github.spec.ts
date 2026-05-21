import { describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@devgarden/harness-core';
import { makeGithubTools } from './github';

const tool = () => makeGithubTools().find((t) => t.name === 'github.openPR')!;

function ctx(host?: HostBridge) {
  return { runId: 'r', workingDir: '/tmp', host } as const;
}

describe('github.openPR', () => {
  it('emits github:openPR via the host bridge and returns url+number', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://github.com/o/r/pull/3',
      number: 3,
    });
    const out = await tool().run(
      { projectId: 'p-1', head: 'feat/x', title: 'auto', body: 'hi' },
      ctx({ request }),
    );
    expect(out).toEqual({ url: 'https://github.com/o/r/pull/3', number: 3 });
    expect(request).toHaveBeenCalledWith('github:openPR', {
      projectId: 'p-1',
      head: 'feat/x',
      title: 'auto',
      base: undefined,
      body: 'hi',
      draft: undefined,
    });
  });

  it('throws when host bridge is missing', async () => {
    await expect(
      tool().run({ projectId: 'p', head: 'h', title: 't' }, ctx(undefined)),
    ).rejects.toThrow(/host bridge/);
  });

  it('throws when ack reports failure', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, error: 'PR already exists' });
    await expect(
      tool().run({ projectId: 'p', head: 'h', title: 't' }, ctx({ request })),
    ).rejects.toThrow(/PR already exists/);
  });

  it('requires projectId, head, title', async () => {
    const request = vi.fn();
    await expect(
      tool().run({ head: 'h', title: 't' } as never, ctx({ request })),
    ).rejects.toThrow(/projectId/);
  });
});
