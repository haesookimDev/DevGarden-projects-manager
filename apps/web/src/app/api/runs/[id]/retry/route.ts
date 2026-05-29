import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { retryRun } from '@/lib/api/runs';

// BFF route: re-run a FAILED / CANCELLED run. The session maps to the
// triggering user; proxies to the internal retry endpoint.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const run = await retryRun(id, session.user.id);
    return NextResponse.json(run);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}
