import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { cancelRun } from '@/lib/api/runs';

// BFF route: cancel an in-flight run. Session-gated; proxies to the internal
// cancel endpoint.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let reason: string | undefined;
  try {
    const body = (await req.json()) as { reason?: unknown };
    if (typeof body.reason === 'string') reason = body.reason;
  } catch {
    /* no body */
  }
  try {
    const result = await cancelRun(id, reason);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}
