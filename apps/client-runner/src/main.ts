// Entry point for the Node sidecar that the Tauri client spawns.
//
// Boot sequence (per N2 plan §3.2):
//   1. Print `sidecar:hello` on stdout so the Rust host knows we are alive.
//   2. Read one JSON line on stdin: `{ apiBaseUrl, jwt }`.
//   3. Open a socket.io client to `<apiBaseUrl>/clients` with the JWT;
//      send `heartbeat` every 30 s so the api keeps the row ONLINE.
//   4. Mirror connection state to stdout as `sidecar:status` events so the
//      Rust host can surface it to the webview.
//
// `run:start` handling lands in N2 PR4 — this PR is the bootstrap +
// heartbeat skeleton only. The sidecar otherwise stays idle.

import { createInterface } from 'node:readline';
import { io as defaultIo, type Socket } from 'socket.io-client';

import { parseBootstrap, readFirstLine } from './bootstrap';

const HEARTBEAT_MS = 30_000;

interface Emitter {
  emit(payload: Record<string, unknown>): void;
}

const stdoutEmitter: Emitter = {
  emit(payload) {
    process.stdout.write(JSON.stringify(payload) + '\n');
  },
};

export async function runSidecar(
  deps: {
    emitter?: Emitter;
    io?: typeof defaultIo;
    stdinLines?: AsyncIterable<string>;
    heartbeatMs?: number;
    /** Optional hook so tests can capture the socket handle. Production
     *  call site leaves this undefined and the socket lifecycle is owned
     *  by this module. */
    onSocket?: (socket: Socket) => void;
  } = {},
): Promise<void> {
  const emitter = deps.emitter ?? stdoutEmitter;
  const ioFn = deps.io ?? defaultIo;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const lines = deps.stdinLines ?? readlineLines();

  emitter.emit({ type: 'sidecar:hello', pid: process.pid, node: process.version });

  const line = await readFirstLine(lines);
  const bootstrap = parseBootstrap(line);
  emitter.emit({
    type: 'sidecar:status',
    status: 'connecting',
    apiBaseUrl: bootstrap.apiBaseUrl,
  });

  const socket = ioFn(`${bootstrap.apiBaseUrl.replace(/\/$/, '')}/clients`, {
    auth: { token: bootstrap.jwt },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
  });
  deps.onSocket?.(socket);

  let heartbeat: NodeJS.Timeout | undefined;

  socket.on('connect', () => {
    emitter.emit({
      type: 'sidecar:status',
      status: 'connected',
      since: new Date().toISOString(),
    });
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => socket.emit('heartbeat'), heartbeatMs);
  });

  socket.on('disconnect', (reason: string) => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    emitter.emit({ type: 'sidecar:status', status: 'disconnected', reason });
  });

  socket.on('connect_error', (err: Error) => {
    emitter.emit({ type: 'sidecar:status', status: 'error', message: err.message });
  });

  const shutdown = (signal: string) => {
    emitter.emit({ type: 'sidecar:shutdown', signal });
    if (heartbeat) clearInterval(heartbeat);
    socket.disconnect();
    // Give the disconnect a moment to flush before the process exits, but
    // don't wait forever — the Rust host kills us on a timer anyway.
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function* readlineLines(): AsyncGenerator<string> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) yield line;
}

// Auto-run when launched as `node dist/runner.js` (the bundled entrypoint).
// Suppressed under vitest so unit tests can call runSidecar() with stubs
// without the module also kicking off a live stdin read on import.
if (process.env.VITEST !== 'true') {
  void runSidecar().catch((err: unknown) => {
    stdoutEmitter.emit({
      type: 'sidecar:error',
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
