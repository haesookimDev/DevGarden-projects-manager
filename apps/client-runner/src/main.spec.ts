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
});
