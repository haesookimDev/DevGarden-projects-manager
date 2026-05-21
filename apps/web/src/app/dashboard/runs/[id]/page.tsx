import { notFound } from 'next/navigation';
import { getRun } from '@/lib/api/runs';
import { RunView } from './run-view';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getRun(id);
    return <RunView initial={run} />;
  } catch {
    notFound();
  }
}
