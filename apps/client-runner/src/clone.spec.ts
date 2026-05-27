import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { cloneProject } from './clone';

interface FakeSpawnCall {
  bin: string;
  args: readonly string[];
}

// Minimal Node child_process.ChildProcess stand-in: we need .stderr (EE),
// .on('error' | 'close'), and that's it for cloneProject's runGit helper.
function fakeChild(exitCode: number, stderr = ''): EventEmitter & { stderr: EventEmitter } {
  const ee = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  ee.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (stderr) ee.stderr.emit('data', Buffer.from(stderr));
    ee.emit('close', exitCode);
  });
  return ee;
}

function enoent(): Error {
  const err = new Error('ENOENT') as Error & { code: string };
  err.code = 'ENOENT';
  return err;
}

function makeFetchScript(responses: Array<Partial<Response> & { _body?: unknown }>) {
  let idx = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[idx++] ?? { ok: false, status: 500, statusText: 'no script' };
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? 'OK',
      json: async () => r._body ?? {},
    } as unknown as Response;
  });
  return { fetchFn, calls };
}

describe('cloneProject', () => {
  it('happy path: posts CLONING, mints token, runs git clone, posts READY', async () => {
    const spawnCalls: FakeSpawnCall[] = [];
    const spawn = vi.fn((bin: string, args: readonly string[]) => {
      spawnCalls.push({ bin, args });
      return fakeChild(0);
    });
    const stat = vi.fn().mockRejectedValue(enoent());
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const { fetchFn, calls } = makeFetchScript([
      { _body: undefined }, // POST clone-status CLONING
      { _body: { token: 'ghs_abcdefgh1234' } }, // POST installation-tokens
      { _body: undefined }, // POST clone-status READY
    ]);

    const result = await cloneProject(
      {
        projectId: 'p1',
        installationId: 7777,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/devgarden/octocat-hello-world',
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt-1',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: mkdir as never,
        stat: stat as never,
      },
    );

    expect(result).toEqual({ ok: true, targetPath: '/tmp/devgarden/octocat-hello-world' });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].bin).toBe('git');
    expect(spawnCalls[0].args[0]).toBe('clone');
    expect(spawnCalls[0].args[1]).toContain(
      'x-access-token:ghs_abcdefgh1234@github.com/octocat/Hello-World.git',
    );
    expect(calls.map((c) => c.url)).toEqual([
      'http://api.local/internal/projects/p1/clone-status',
      'http://api.local/internal/clients/installation-tokens',
      'http://api.local/internal/projects/p1/clone-status',
    ]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ status: 'CLONING' });
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ status: 'READY' });
  });

  it('useWorktrees runs clone --bare and worktree add', async () => {
    const spawnCalls: FakeSpawnCall[] = [];
    const spawn = vi.fn((bin: string, args: readonly string[]) => {
      spawnCalls.push({ bin, args });
      return fakeChild(0);
    });
    const stat = vi.fn().mockRejectedValue(enoent());
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const { fetchFn } = makeFetchScript([
      { _body: undefined },
      { _body: { token: 'ghs_wtree123' } },
      { _body: undefined },
    ]);

    const result = await cloneProject(
      {
        projectId: 'p2',
        installationId: 1,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/proj2',
        useWorktrees: true,
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: mkdir as never,
        stat: stat as never,
      },
    );

    expect(result).toMatchObject({ ok: true, bareDir: '/tmp/proj2/.bare' });
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[0].args.slice(0, 3)).toEqual(['clone', '--bare', expect.any(String)]);
    expect(spawnCalls[1].args.slice(0, 5)).toEqual([
      '--git-dir',
      '/tmp/proj2/.bare',
      'worktree',
      'add',
      '/tmp/proj2/main',
    ]);
  });

  it('refuses to clone when the target path already exists', async () => {
    const spawn = vi.fn();
    const stat = vi.fn().mockResolvedValue({}); // path exists
    const { fetchFn } = makeFetchScript([{ _body: undefined }]); // FAILED report

    const result = await cloneProject(
      {
        projectId: 'p3',
        installationId: 1,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/already-here',
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: vi.fn() as never,
        stat: stat as never,
      },
    );

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/target path already exists/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('redacts ghs_ tokens from error messages', async () => {
    const spawn = vi.fn(() =>
      fakeChild(128, 'fatal: could not read Username for ghs_supersecret123'),
    );
    const stat = vi.fn().mockRejectedValue(enoent());
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const { fetchFn, calls } = makeFetchScript([
      { _body: undefined },
      { _body: { token: 'ghs_supersecret123' } },
      { _body: undefined }, // FAILED report
    ]);

    const result = await cloneProject(
      {
        projectId: 'p4',
        installationId: 1,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/redact',
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: mkdir as never,
        stat: stat as never,
      },
    );

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).not.toContain('ghs_supersecret123');
    expect((result as { error: string }).error).toContain('ghs_***');
    // The FAILED report must also be redacted.
    const lastBody = JSON.parse(calls[2].init.body as string) as { error: string };
    expect(lastBody.error).not.toContain('ghs_supersecret123');
  });

  it('rejects when the installation-token endpoint returns no token', async () => {
    const spawn = vi.fn();
    const stat = vi.fn().mockRejectedValue(enoent());
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const { fetchFn } = makeFetchScript([
      { _body: undefined },
      { _body: { wrong: 'field' } },
      { _body: undefined },
    ]);

    const result = await cloneProject(
      {
        projectId: 'p5',
        installationId: 1,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/p5',
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: mkdir as never,
        stat: stat as never,
      },
    );

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/missing "token"/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('surfaces non-2xx from the CLONING report as the failure error', async () => {
    const spawn = vi.fn();
    const stat = vi.fn().mockRejectedValue(enoent());
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const { fetchFn } = makeFetchScript([
      { ok: false, status: 400, statusText: 'Bad Request', _body: undefined },
      { _body: undefined }, // FAILED report
    ]);

    const result = await cloneProject(
      {
        projectId: 'p6',
        installationId: 1,
        repoFullName: 'octocat/Hello-World',
        targetPath: '/tmp/p6',
      },
      {
        apiBaseUrl: 'http://api.local',
        jwt: 'jwt',
        fetch: fetchFn as unknown as typeof globalThis.fetch,
        spawn: spawn as never,
        mkdir: mkdir as never,
        stat: stat as never,
      },
    );

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/clone-status webhook CLONING failed/);
  });
});
