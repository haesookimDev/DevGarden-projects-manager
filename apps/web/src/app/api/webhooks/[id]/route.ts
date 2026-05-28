import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getWebhookEvent } from '@/lib/api/webhooks';

// BFF route for the webhooks dashboard payload preview (lazy-loaded when a
// row is expanded). Session-gated.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const event = await getWebhookEvent(id);
    return NextResponse.json(event);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
