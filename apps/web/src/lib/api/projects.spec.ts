import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchClone, getProject } from './projects';

const originalUrl = process.env.API_INTERNAL_URL;
const originalSecret = process.env.INTERNAL_API_SECRET;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.API_INTERNAL_URL = 'http://api.local';
  process.env.INTERNAL_API_SECRET = 'shh';
});

afterEach(() => {
  restore('API_INTERNAL_URL', originalUrl);
  restore('INTERNAL_API_SECRET', originalSecret);
  vi.unstubAllGlobals();
});

describe('dispatchClone', () => {
  it('POSTs to /internal/projects/:id/clone with clientId + targetPath', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchSpy);

    await dispatchClone({ projectId: 'p1', clientId: 'c1', targetPath: '/tmp/x' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.local/internal/projects/p1/clone');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ clientId: 'c1', targetPath: '/tmp/x' });
  });

  it('includes useWorktrees=true only when set', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchSpy);

    await dispatchClone({
      projectId: 'p2',
      clientId: 'c2',
      targetPath: '/tmp/y',
      useWorktrees: true,
    });
    const init = fetchSpy.mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({
      clientId: 'c2',
      targetPath: '/tmp/y',
      useWorktrees: true,
    });
  });

  it('throws when the api responds non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      dispatchClone({ projectId: 'p', clientId: 'c', targetPath: '/tmp/x' }),
    ).rejects.toThrow(/dispatchClone failed: 400/);
  });
});

describe('getProject', () => {
  it('returns the parsed ProjectDetail including cloneStatus fields', async () => {
    const body = {
      id: 'p1',
      repoFullName: 'o/r',
      githubInstallationId: 1,
      githubRepoId: 2,
      localRoot: '/tmp/p',
      worktreePolicy: 'AUTO_REMOVE_SUCCESS',
      cloneStatus: 'CLONING',
      cloneError: null,
      cloneCompletedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      defaultClient: null,
      defaultHarness: null,
      runCount: 0,
      lastRun: null,
      lastEvent: null,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await getProject('p1');
    expect(result.cloneStatus).toBe('CLONING');
    expect(result.cloneError).toBeNull();
    expect(result.cloneCompletedAt).toBeNull();
  });
});
