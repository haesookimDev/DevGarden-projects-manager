import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSidecar } from './main';

// Bare-minimum socket.io-client mock. Captures handlers + emits so a test
// can drive lifecycle events from outside and assert what runSidecar
// surfaced through the emitter.
function makeMockSocket() {
  const handlers = new Map<string, (arg?: unknown) => void>();
  const emitSpy = vi.fn();
  return {
    handlers,
    emitSpy,
    socket: {
      on(event: string, cb: (arg?: unknown) => void) {
        handlers.set(event, cb);
      },
      emit: emitSpy,
      disconnect: vi.fn(),
    },
  };
}

async function* singleLine(line: string): AsyncGenerator<string> {
  yield line;
}

describe('runSidecar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits hello, parses bootstrap, opens a socket, and announces connected', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    const ioFn = vi.fn().mockReturnValue(mock.socket) as never;

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: ioFn,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      heartbeatMs: 1_000,
    });

    expect(ioFn).toHaveBeenCalledWith(
      'http://api.local/clients',
      expect.objectContaining({ auth: { token: 'tkn' }, transports: ['websocket'] }),
    );
    expect(events).toEqual([
      expect.objectContaining({ type: 'sidecar:hello' }),
      expect.objectContaining({
        type: 'sidecar:status',
        status: 'connecting',
        apiBaseUrl: 'http://api.local',
      }),
    ]);

    // Fire `connect` and the heartbeat tick.
    mock.handlers.get('connect')?.();
    expect(events.at(-1)).toMatchObject({ type: 'sidecar:status', status: 'connected' });
    vi.advanceTimersByTime(1_000);
    expect(mock.emitSpy).toHaveBeenCalledWith('heartbeat');
    vi.advanceTimersByTime(1_000);
    expect(mock.emitSpy).toHaveBeenCalledTimes(2);
  });

  it('reports disconnect + clears the heartbeat', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      heartbeatMs: 1_000,
    });

    mock.handlers.get('connect')?.();
    mock.emitSpy.mockClear();
    mock.handlers.get('disconnect')?.('transport close');

    expect(events.at(-1)).toMatchObject({
      type: 'sidecar:status',
      status: 'disconnected',
      reason: 'transport close',
    });
    // Heartbeat must have been cleared — further ticks emit nothing.
    vi.advanceTimersByTime(5_000);
    expect(mock.emitSpy).not.toHaveBeenCalled();
  });

  it('forwards a connect_error as sidecar:status error', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
    });
    mock.handlers.get('connect_error')?.(new Error('boom'));
    expect(events.at(-1)).toMatchObject({
      type: 'sidecar:status',
      status: 'error',
      message: 'boom',
    });
  });

  it('dispatches run:start to executeRun and announces start + end on stdout', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    const executeRun = vi.fn().mockResolvedValue({ status: 'SUCCESS' });

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      executeRun,
    });

    const payload = {
      runId: 'run_1',
      harness: { name: 'noop', version: 1, steps: [] },
      inputs: {},
      workingDir: '/tmp/work',
    };
    mock.handlers.get('run:start')?.(payload);
    // executeRun runs async — flush the microtask queue.
    await vi.waitFor(() => expect(executeRun).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(events.some((e) => e.type === 'sidecar:run-end' && e.runId === 'run_1')).toBe(true),
    );
    expect(executeRun).toHaveBeenCalledWith(
      mock.socket,
      payload,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(events.some((e) => e.type === 'sidecar:run-start' && e.runId === 'run_1')).toBe(true);
  });

  it('aborts the matching run on run:cancel', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    let captured: { signal?: AbortSignal } | undefined;
    // Never resolves — keeps the run "in flight" so the controller stays in the
    // registry when run:cancel arrives.
    const executeRun = vi.fn().mockImplementation((_s, _p, deps) => {
      captured = deps as { signal?: AbortSignal };
      return new Promise(() => {});
    });

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      executeRun,
    });

    mock.handlers.get('run:start')?.({
      runId: 'run_c',
      harness: { name: 'noop', version: 1, steps: [] },
      inputs: {},
      workingDir: '/tmp/work',
    });
    expect(captured?.signal?.aborted).toBe(false);

    mock.handlers.get('run:cancel')?.({ runId: 'run_c' });
    expect(captured?.signal?.aborted).toBe(true);
    expect(events.some((e) => e.type === 'sidecar:run-cancel' && e.runId === 'run_c')).toBe(true);
  });

  it('emits sidecar:cancel-miss for a run:cancel with no matching run', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      executeRun: vi.fn(),
    });

    mock.handlers.get('run:cancel')?.({ runId: 'ghost' });
    expect(events.some((e) => e.type === 'sidecar:cancel-miss' && e.runId === 'ghost')).toBe(true);
  });

  it('reports an executeRun rejection as sidecar:error with the runId', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    const executeRun = vi.fn().mockRejectedValue(new Error('boom'));

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      executeRun,
    });

    mock.handlers.get('run:start')?.({
      runId: 'run_2',
      harness: {},
      inputs: {},
      workingDir: '/tmp/work',
    });
    await vi.waitFor(() =>
      expect(
        events.some(
          (e) => e.type === 'sidecar:error' && e.runId === 'run_2' && e.message === 'boom',
        ),
      ).toBe(true),
    );
  });

  it('dispatches client:cloneProject to cloneProject and surfaces start + end', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    const cloneProject = vi.fn().mockResolvedValue({ ok: true, targetPath: '/tmp/proj' } as const);

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      cloneProject,
    });

    mock.handlers.get('client:cloneProject')?.({
      projectId: 'p1',
      installationId: 1,
      repoFullName: 'octocat/Hello-World',
      targetPath: '/tmp/proj',
    });

    await vi.waitFor(() => expect(cloneProject).toHaveBeenCalledTimes(1));
    expect(cloneProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', targetPath: '/tmp/proj' }),
      expect.objectContaining({ apiBaseUrl: 'http://api.local', jwt: 'tkn' }),
    );
    expect(events.some((e) => e.type === 'sidecar:clone-start' && e.projectId === 'p1')).toBe(true);
    await vi.waitFor(() =>
      expect(events.some((e) => e.type === 'sidecar:clone-end' && e.projectId === 'p1')).toBe(true),
    );
  });

  it('surfaces a cloneProject failure as sidecar:clone-error with the projectId', async () => {
    const events: Array<Record<string, unknown>> = [];
    const mock = makeMockSocket();
    const cloneProject = vi.fn().mockResolvedValue({ ok: false, error: 'target exists' } as const);

    await runSidecar({
      emitter: { emit: (e) => events.push(e) },
      io: vi.fn().mockReturnValue(mock.socket) as never,
      stdinLines: singleLine(JSON.stringify({ apiBaseUrl: 'http://api.local', jwt: 'tkn' })),
      cloneProject,
    });

    mock.handlers.get('client:cloneProject')?.({
      projectId: 'p2',
      installationId: 1,
      repoFullName: 'octocat/Nope',
      targetPath: '/tmp/p2',
    });

    await vi.waitFor(() =>
      expect(
        events.some(
          (e) =>
            e.type === 'sidecar:clone-error' &&
            e.projectId === 'p2' &&
            e.message === 'target exists',
        ),
      ).toBe(true),
    );
  });
});
