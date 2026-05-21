import { describe, expect, it, vi } from 'vitest';
import { startClientSocket, type ConnectionStatus } from './client-socket';

interface FakeSocket {
  listeners: Record<string, (...args: unknown[]) => void>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
}

function makeFakeIo() {
  let lastUrl = '';
  let lastOpts: Record<string, unknown> | undefined;
  let lastSocket: FakeSocket | undefined;

  const ioFn = ((url: string, opts: Record<string, unknown>) => {
    lastUrl = url;
    lastOpts = opts;
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const socket: FakeSocket = {
      listeners,
      emit: vi.fn(),
      disconnect: vi.fn(),
      on: (event, fn) => {
        listeners[event] = fn;
      },
    };
    lastSocket = socket;
    return socket as never;
  }) as unknown as Parameters<typeof startClientSocket>[1]['io'];

  return {
    io: ioFn,
    get url() {
      return lastUrl;
    },
    get opts() {
      return lastOpts;
    },
    get socket() {
      if (!lastSocket) throw new Error('socket not created');
      return lastSocket;
    },
  };
}

describe('startClientSocket', () => {
  it('opens /clients namespace with the jwt in auth.token', () => {
    const fake = makeFakeIo();
    startClientSocket(
      { apiBaseUrl: 'http://api.local/', jwt: 'jwt-xyz' },
      { io: fake.io, setInterval: () => 0, clearInterval: () => undefined },
    );
    expect(fake.url).toBe('http://api.local/clients');
    expect((fake.opts?.auth as { token: string }).token).toBe('jwt-xyz');
    expect(fake.opts?.reconnection).toBe(true);
  });

  it('emits connecting then connected and starts heartbeat on connect', () => {
    const fake = makeFakeIo();
    const setIntervalFn = vi.fn().mockReturnValue(42);
    const onStatus = vi.fn();

    startClientSocket(
      { apiBaseUrl: 'http://x', jwt: 'j', onStatus, heartbeatMs: 5_000 },
      { io: fake.io, setInterval: setIntervalFn, clearInterval: vi.fn() },
    );

    expect(onStatus.mock.calls[0][0]).toEqual({ kind: 'connecting' });
    fake.socket.listeners.connect?.();

    const second = onStatus.mock.calls[1][0] as ConnectionStatus;
    expect(second.kind).toBe('connected');
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5_000);

    const [handler] = setIntervalFn.mock.calls[0];
    handler();
    expect(fake.socket.emit).toHaveBeenCalledWith('heartbeat');
  });

  it('clears the heartbeat interval on disconnect and reports the reason', () => {
    const fake = makeFakeIo();
    const setIntervalFn = vi.fn().mockReturnValue(99);
    const clearIntervalFn = vi.fn();
    const onStatus = vi.fn();

    startClientSocket(
      { apiBaseUrl: 'http://x', jwt: 'j', onStatus },
      { io: fake.io, setInterval: setIntervalFn, clearInterval: clearIntervalFn },
    );
    fake.socket.listeners.connect?.();
    fake.socket.listeners.disconnect?.('transport close');

    expect(clearIntervalFn).toHaveBeenCalledWith(99);
    const last = onStatus.mock.calls.at(-1)?.[0] as ConnectionStatus;
    expect(last).toEqual({ kind: 'disconnected', reason: 'transport close' });
  });

  it('reports errors via onStatus', () => {
    const fake = makeFakeIo();
    const onStatus = vi.fn();
    startClientSocket(
      { apiBaseUrl: 'http://x', jwt: 'j', onStatus },
      { io: fake.io, setInterval: () => 0, clearInterval: () => undefined },
    );
    fake.socket.listeners.connect_error?.(new Error('boom'));
    const last = onStatus.mock.calls.at(-1)?.[0] as ConnectionStatus;
    expect(last).toEqual({ kind: 'error', message: 'boom' });
  });

  it('disconnect() clears the heartbeat and calls socket.disconnect', () => {
    const fake = makeFakeIo();
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue(7);

    const handle = startClientSocket(
      { apiBaseUrl: 'http://x', jwt: 'j' },
      { io: fake.io, setInterval: setIntervalFn, clearInterval: clearIntervalFn },
    );
    fake.socket.listeners.connect?.();

    handle.disconnect();
    expect(clearIntervalFn).toHaveBeenCalledWith(7);
    expect(fake.socket.disconnect).toHaveBeenCalled();
  });
});
