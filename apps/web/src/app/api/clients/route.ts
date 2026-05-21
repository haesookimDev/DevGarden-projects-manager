import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listClientsByOwner } from '@/lib/api/clients';

// BFF route. Browser polls this instead of calling /internal/clients directly,
// so the INTERNAL_API_SECRET never leaves the web server.
export async function GET() {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const clients = await listClientsByOwner(ownerId);
    return NextResponse.json(clients);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
