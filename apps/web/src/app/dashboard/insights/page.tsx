import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getCostTrend, type CostTrend } from '@/lib/api/insights';
import { CostChart } from './cost-chart';

const VALID_DAYS = new Set([7, 30, 90]);

// Cost / token insights (N6). Day-range selector (7 / 30 / 90) via ?days=
// query so it's shareable; the chart + breakdowns are client-rendered.
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const [{ days: daysRaw }, session] = await Promise.all([searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/insights');

  const days = daysRaw && VALID_DAYS.has(Number(daysRaw)) ? Number(daysRaw) : 30;

  let trend: CostTrend | null = null;
  let error: string | null = null;
  try {
    trend = await getCostTrend(ownerId, days);
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to load insights';
  }

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:underline">
              ← Dashboard
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            일별 cost / token 추이와 project / harness 별 break-down.
          </p>
        </div>
        <nav className="flex gap-1" data-testid="insights-range">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/dashboard/insights?days=${d}`}
              data-testid={`insights-range-${d}`}
              data-active={d === days ? '1' : '0'}
              className={
                'rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                (d === days
                  ? 'border-foreground font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground')
              }
            >
              {d}d
            </Link>
          ))}
        </nav>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {trend && (
        <section className="mt-6">
          <CostChart trend={trend} />
        </section>
      )}
    </main>
  );
}
