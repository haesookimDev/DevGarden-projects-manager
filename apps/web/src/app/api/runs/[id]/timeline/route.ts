import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRunTimeline } from '@/lib/api/runs';

// BFF route for the run-detail Timeline tab. Gated on the NextAuth session
// so the browser never sees the internal secret.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const timeline = await getRunTimeline(id);
    return NextResponse.json(timeline);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
