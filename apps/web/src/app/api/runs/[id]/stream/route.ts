// Server-sent-events stream for live run updates.
//
// Flow:
//   Browser  ──EventSource──▶  /api/runs/[id]/stream  (this route, authenticated by NextAuth)
//                              opens a server-side socket.io-client connection to api,
//                              authenticates with INTERNAL_API_SECRET in auth.token,
//                              joins room `run:<id>`, forwards every event as SSE.
//
// Why SSE-over-BFF rather than direct browser→api socket: avoids inventing a
// viewer-JWT model. Internal secret stays server-only; browser only ever talks
// to its own origin.

import { auth } from '@/auth';
import { getInternalApiConfig } from '@/lib/api/internal';
import { io as createSocket, type Socket } from 'socket.io-client';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { id: runId } = await ctx.params;
  if (!runId) return new Response('runId required', { status: 400 });

  const { baseUrl, secret } = getInternalApiConfig();

  const encoder = new TextEncoder();
  let socket: Socket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown): void => {
        const lines = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(lines));
        } catch {
          // Stream may have been closed by the client; ignore.
        }
      };

      socket = createSocket(`${baseUrl.replace(/\/$/, '')}/clients`, {
        auth: { token: secret },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
      });

      socket.on('connect', () => {
        socket?.emit('subscribe:run', { runId });
        send('open', { runId });
      });
      socket.on('disconnect', (reason) => {
        send('disconnect', { reason });
      });
      socket.on('connect_error', (err) => {
        send('error', { message: err.message });
      });

      const forward = (event: string) =>
        socket?.on(event, (payload) => send(event, payload));
      forward('run:start');
      forward('run:log');
      forward('run:step');
      forward('run:status');

      // Heartbeat so intermediate proxies don't close idle connections.
      heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 15_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (socket) {
        socket.emit('unsubscribe:run', { runId });
        socket.disconnect();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
