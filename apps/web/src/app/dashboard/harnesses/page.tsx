import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileCode2, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@devgarden/ui';

import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { listHarnessesByOwner, type HarnessSummary } from '@/lib/api/harnesses';

// Owner's harness library. Default view is one row per name (latest version);
// flip the ?history=1 query to expand into the full version history.
export default async function HarnessesListPage({
  searchParams,
}: {
  searchParams: Promise<{ history?: string }>;
}) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/harnesses');

  const { history } = await searchParams;
  const showHistory = history === '1';

  let harnesses: HarnessSummary[] = [];
  let loadError: string | null = null;
  try {
    harnesses = await listHarnessesByOwner(ownerId, { latestOnly: !showHistory });
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load harnesses';
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
          <h1 className="mt-2 text-2xl font-semibold">Harnesses</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            YAML 로 정의하는 에이전트 파이프라인. 같은 이름으로 저장하면 새 version 이 생성됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" data-testid="harnesses-history-toggle">
            <Link href={showHistory ? '/dashboard/harnesses' : '/dashboard/harnesses?history=1'}>
              {showHistory ? 'Hide history' : 'Show all versions'}
            </Link>
          </Button>
          <Button asChild size="sm" data-testid="harnesses-new-cta">
            <Link href="/dashboard/harnesses/new">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New harness
            </Link>
          </Button>
        </div>
      </header>

      {loadError && (
        <p
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="harnesses-load-error"
        >
          {loadError}
        </p>
      )}

      {harnesses.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={FileCode2}
          title="No harnesses yet"
          description="템플릿에서 시작하거나 빈 YAML 로 새 harness 를 만들어 보세요."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/harnesses/new" data-testid="harnesses-empty-cta">
                Create your first harness →
              </Link>
            </Button>
          }
          testId="harnesses-empty"
        />
      ) : showHistory ? (
        <HarnessHistoryList harnesses={harnesses} />
      ) : (
        <HarnessLatestGrid harnesses={harnesses} />
      )}
    </main>
  );
}

function HarnessLatestGrid({ harnesses }: { harnesses: HarnessSummary[] }) {
  return (
    <ul
      className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="harnesses-list"
    >
      {harnesses.map((h) => (
        <li key={h.id}>
          <Link
            href={`/dashboard/harnesses/${h.id}`}
            className="block transition-colors"
            data-testid="harnesses-list-row"
            data-harness-name={h.name}
          >
            <Card className="hover:border-foreground/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {h.name}
                  <Badge variant="outline" className="text-[10px]">
                    v{h.version}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  updated {new Date(h.updatedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-[11px] text-muted-foreground">{h.id}</p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HarnessHistoryList({ harnesses }: { harnesses: HarnessSummary[] }) {
  // Group by name; within each group keep version-desc order.
  const grouped = new Map<string, HarnessSummary[]>();
  for (const h of harnesses) {
    const arr = grouped.get(h.name) ?? [];
    arr.push(h);
    grouped.set(h.name, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => b.version - a.version);
  }

  // Render in updated-desc order of each group's latest entry.
  const groups = [...grouped.entries()].sort((a, b) => {
    const aLatest = a[1][0]?.updatedAt ?? '';
    const bLatest = b[1][0]?.updatedAt ?? '';
    return bLatest.localeCompare(aLatest);
  });

  return (
    <div className="mt-6 space-y-6" data-testid="harnesses-history">
      {groups.map(([name, versions]) => (
        <section
          key={name}
          className="rounded-md border border-border p-4"
          data-testid="harnesses-history-group"
          data-harness-name={name}
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{name}</h2>
            <Badge variant="outline" className="text-[10px]">
              {versions.length} versions
            </Badge>
          </header>
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/dashboard/harnesses/${v.id}`}
                  className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-accent"
                  data-testid="harnesses-history-row"
                  data-harness-version={v.version}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      v{v.version}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">{v.id}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.updatedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
