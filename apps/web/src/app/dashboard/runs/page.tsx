import Link from 'next/link';
import { Card, CardContent } from '@devgarden/ui';
import { auth } from '@/auth';
import { getRunsStats, listRunsByOwner, type RunHistoryRow, type RunsStats } from '@/lib/api/runs';

export default async function RunsHistoryPage() {
  const session = await auth();
  const ownerId = session?.user?.id;

  let runs: RunHistoryRow[] = [];
  let stats: RunsStats | null = null;
  let error: string | null = null;
  if (ownerId) {
    try {
      [runs, stats] = await Promise.all([
        listRunsByOwner(ownerId, { limit: 50 }),
        getRunsStats(ownerId, { sinceHours: 24 * 7 }),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'failed to load runs history';
    }
  }

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Runs history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          최근 50개 실행 + 지난 7일 통계. 더 좁히려면 status 필터를 추가할 예정.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {stats && <StatsGrid stats={stats} />}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent runs ({runs.length})</h2>
        {runs.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">아직 실행된 run 이 없습니다.</p>
        )}
        {runs.length > 0 && (
          <Card className="mt-3 overflow-hidden p-0">
            <CardContent className="p-0">
              <ul data-testid="runs-history-list" className="divide-y divide-border">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/runs/${r.id}`}
                      data-testid="runs-history-row"
                      className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <div>
                        <p className="font-mono text-sm">{r.id.slice(0, 12)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.repoFullName} · started {new Date(r.startedAt).toLocaleString()}
                          {r.finishedAt && (
                            <>
                              {' · '}
                              {formatDuration(
                                new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime(),
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}

function StatsGrid({ stats }: { stats: RunsStats }) {
  const success = stats.counts.SUCCESS ?? 0;
  const failed = stats.counts.FAILED ?? 0;
  const queued = stats.counts.QUEUED ?? 0;
  const running = stats.counts.RUNNING ?? 0;
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        testId="runs-stat-total"
        label={`Total (last ${Math.round(stats.sinceHours / 24)}d)`}
        value={stats.total.toString()}
      />
      <Stat
        testId="runs-stat-success-rate"
        label="Success rate"
        value={stats.successRate === null ? '—' : `${Math.round(stats.successRate * 100)}%`}
      />
      <Stat
        testId="runs-stat-status"
        label="By status"
        value={`✓${success} ✗${failed} ⋯${running + queued}`}
      />
      <Stat
        testId="runs-stat-cost"
        label="Total cost"
        value={stats.totalCostUsd === 0 ? '—' : `$${stats.totalCostUsd.toFixed(4)}`}
      />
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = statusClass(status);
  return (
    <span
      data-testid={`runs-history-status-${status.toLowerCase()}`}
      className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-500';
    case 'SUCCESS':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
    case 'FAILED':
      return 'border-destructive/50 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
