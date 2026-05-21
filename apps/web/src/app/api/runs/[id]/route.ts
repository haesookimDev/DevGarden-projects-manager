import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRun } from '@/lib/api/runs';

// BFF route. Browser polls /api/runs/[id] for fresh status / logs while a run
// is active. Auth is enforced via the NextAuth session.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const run = await getRun(id);
    return NextResponse.json(run);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
