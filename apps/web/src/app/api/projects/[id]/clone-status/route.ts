import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject } from '@/lib/api/projects';

// BFF route. The CloneStatusPoller on /dashboard/projects/[id]/clone-status
// polls this every 2s while a clone is in flight. Auth gated on the
// NextAuth session so the browser never receives the api's internal secret.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const project = await getProject(id);
    return NextResponse.json({
      cloneStatus: project.cloneStatus,
      cloneError: project.cloneError,
      cloneCompletedAt: project.cloneCompletedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
