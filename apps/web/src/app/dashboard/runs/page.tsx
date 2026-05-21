import Link from 'next/link';
import { auth } from '@/auth';
import {
  getRunsStats,
  listRunsByOwner,
  type RunHistoryRow,
  type RunsStats,
} from '@/lib/api/runs';

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
      <header className="border-b border-neutral-800 pb-4">
        <p className="text-sm text-neutral-400">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Runs history</h1>
        <p className="mt-1 text-sm text-neutral-500">
          최근 50개 실행 + 지난 7일 통계. 더 좁히려면 status 필터를 추가할 예정.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {stats && <StatsGrid stats={stats} />}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent runs ({runs.length})</h2>
        {runs.length === 0 && (
          <p className="mt-2 text-sm text-neutral-500">아직 실행된 run 이 없습니다.</p>
        )}
        {runs.length > 0 && (
          <ul
            data-testid="runs-history-list"
            className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800"
          >
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/runs/${r.id}`}
                  data-testid="runs-history-row"
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
                >
                  <div>
                    <p className="font-mono text-sm">{r.id.slice(0, 12)}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {r.repoFullName} · started {new Date(r.startedAt).toLocaleString()}
                      {r.finishedAt && (
                        <>
                          {' · '}
                          {formatDuration(
                            new Date(r.finishedAt).getTime() -
                              new Date(r.startedAt).getTime(),
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
    <div
      data-testid={testId}
      className="rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-3"
    >
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED: 'bg-neutral-800 text-neutral-300',
    RUNNING: 'bg-amber-950 text-amber-200',
    SUCCESS: 'bg-emerald-950 text-emerald-300',
    FAILED: 'bg-red-950 text-red-200',
    CANCELLED: 'bg-neutral-800 text-neutral-400',
  };
  const cls = map[status] ?? 'bg-neutral-800 text-neutral-400';
  return (
    <span
      data-testid={`runs-history-status-${status.toLowerCase()}`}
      className={`rounded-full px-2 py-0.5 text-xs ${cls}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
