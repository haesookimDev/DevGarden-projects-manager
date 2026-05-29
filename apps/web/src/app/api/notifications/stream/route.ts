// Server-sent-events stream for live notifications (N5).
//
// Browser ──EventSource──▶ /api/notifications/stream (this route, NextAuth)
//   resolves the session → owner id, then proxies the api's authenticated SSE
//   endpoint with the internal secret. The browser only ever talks to its own
//   origin; the internal secret stays server-side.

import { auth } from '@/auth';
import { getInternalApiConfig } from '@/lib/api/internal';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return new Response('Unauthorized', { status: 401 });

  const { baseUrl, secret } = getInternalApiConfig();
  const upstream = await fetch(
    `${baseUrl.replace(/\/$/, '')}/internal/users/${encodeURIComponent(ownerId)}/notifications/stream`,
    {
      headers: { 'x-internal-secret': secret, accept: 'text/event-stream' },
      // Abort the upstream stream when the browser disconnects.
      signal: req.signal,
      cache: 'no-store',
    },
  ).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response('upstream error', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
