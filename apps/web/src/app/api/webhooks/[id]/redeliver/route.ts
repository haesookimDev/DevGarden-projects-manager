import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { redeliverWebhookEvent } from '@/lib/api/webhooks';

// BFF route for the webhooks dashboard "Redeliver" button. Session-gated so
// the browser never sees the internal secret.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const result = await redeliverWebhookEvent(id);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
