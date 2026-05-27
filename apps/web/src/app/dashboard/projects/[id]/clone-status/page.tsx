import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';
import { getProject } from '@/lib/api/projects';
import { CloneStatusPoller } from './poller';

// Server-rendered with the latest snapshot, then a client poller takes over
// to refresh every 2s until the status leaves CLONING. We could SSE/WebSocket
// this, but a single REST poll keeps the wiring simple and the page is only
// open during the first ~60s after a project is created.
export default async function CloneStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold" data-testid="clone-status-title">
          Cloning {project.repoFullName}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          데스크탑 client 가 위 repo 를 <code className="font-mono">{project.localRoot}</code> 에
          clone 합니다. 끝나면 자동으로 project detail 로 이동합니다.
        </p>
      </header>

      {error && (
        <p
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="clone-status-dispatch-error"
        >
          Clone dispatch 실패: {decodeURIComponent(error)}
        </p>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CloneStatusPoller
              projectId={project.id}
              initial={{
                cloneStatus: project.cloneStatus,
                cloneError: project.cloneError,
                cloneCompletedAt: project.cloneCompletedAt,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Where
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">Repo:</span> {project.repoFullName}
            </p>
            <p>
              <span className="text-muted-foreground">Target path:</span>{' '}
              <code className="font-mono text-xs">{project.localRoot}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Installation:</span> #
              {project.githubInstallationId}
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
