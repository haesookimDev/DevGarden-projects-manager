// Wraps a socket.io connection to the api `/clients` namespace.
// Connect with the paired JWT in `auth.token`, then emit `heartbeat` every
// HEARTBEAT_INTERVAL_MS so the server keeps the row ONLINE.
//
// All side-effects (real socket.io, setInterval) are injected so unit tests
// can drive the lifecycle deterministically with stubs / fake timers.

import { io as defaultIo, type Socket } from 'socket.io-client';

export const HEARTBEAT_INTERVAL_MS = 30_000;

export type ConnectionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; since: string }
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'error'; message: string };

export interface ClientSocketDeps {
  io?: typeof defaultIo;
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface ClientSocketOptions {
  apiBaseUrl: string;
  jwt: string;
  onStatus?: (status: ConnectionStatus) => void;
  heartbeatMs?: number;
}

export interface ClientSocketHandle {
  socket: Socket;
  disconnect: () => void;
}

export function startClientSocket(
  opts: ClientSocketOptions,
  deps: ClientSocketDeps = {},
): ClientSocketHandle {
  const ioFn = deps.io ?? defaultIo;
  const setIntervalFn = deps.setInterval ?? ((h, ms) => globalThis.setInterval(h, ms));
  const clearIntervalFn =
    deps.clearInterval ?? ((handle) => globalThis.clearInterval(handle as number));

  const emit = (status: ConnectionStatus) => opts.onStatus?.(status);
  emit({ kind: 'connecting' });

  const socket = ioFn(`${opts.apiBaseUrl.replace(/\/$/, '')}/clients`, {
    auth: { token: opts.jwt },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
  });

  let heartbeat: unknown;

  socket.on('connect', () => {
    emit({ kind: 'connected', since: new Date().toISOString() });
    if (heartbeat) clearIntervalFn(heartbeat);
    heartbeat = setIntervalFn(() => {
      socket.emit('heartbeat');
    }, opts.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
  });

  socket.on('disconnect', (reason: string) => {
    if (heartbeat) {
      clearIntervalFn(heartbeat);
      heartbeat = undefined;
    }
    emit({ kind: 'disconnected', reason });
  });

  socket.on('connect_error', (err: Error) => {
    emit({ kind: 'error', message: err.message });
  });

  return {
    socket,
    disconnect: () => {
      if (heartbeat) {
        clearIntervalFn(heartbeat);
        heartbeat = undefined;
      }
      socket.disconnect();
    },
  };
}
