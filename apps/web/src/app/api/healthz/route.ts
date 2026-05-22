// Always-200 liveness endpoint for compose / orchestrator healthchecks.
// Intentionally side-effect free: no DB or api call, no auth — just confirms
// the Next.js process can serve requests.

export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
