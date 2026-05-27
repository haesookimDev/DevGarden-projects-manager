import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { dryRunHarness, type DryRunInput } from '@/lib/api/harness-dry-run';

// BFF passthrough for the editor's Dry-run button. Browser POSTs the same
// shape the api expects ({ yaml? | definition?, inputs? }); we just forward
// after checking the NextAuth session so the internal secret never reaches
// the browser.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: DryRunInput;
  try {
    body = (await req.json()) as DryRunInput;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const result = await dryRunHarness(body);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
