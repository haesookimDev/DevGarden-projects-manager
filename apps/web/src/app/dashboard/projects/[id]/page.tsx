import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';
import { getProject } from '@/lib/api/projects';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
        <h1 className="mt-2 text-2xl font-semibold" data-testid="project-detail-name">
          {project.repoFullName}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          installation #{project.githubInstallationId} · repo #{project.githubRepoId}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total runs" value={project.runCount.toString()} testId="project-stat-runs" />
        <Stat
          label="Last run"
          value={project.lastRun ? project.lastRun.status.toLowerCase() : '—'}
          testId="project-stat-last-run"
        />
        <Stat
          label="Last github event"
          value={
            project.lastEvent
              ? `${project.lastEvent.eventType}${
                  project.lastEvent.action ? `:${project.lastEvent.action}` : ''
                }`
              : '—'
          }
          testId="project-stat-last-event"
        />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailCard title="Configuration">
          <Row
            label="Local root"
            value={<code className="font-mono text-xs">{project.localRoot}</code>}
          />
          <Row label="Worktree policy" value={project.worktreePolicy.toLowerCase()} />
          <Row label="Created" value={new Date(project.createdAt).toLocaleString()} />
          <Row label="Updated" value={new Date(project.updatedAt).toLocaleString()} />
        </DetailCard>

        <DetailCard title="Defaults">
          <Row
            label="Default client"
            value={
              project.defaultClient ? (
                `${project.defaultClient.name} (${project.defaultClient.status.toLowerCase()})`
              ) : (
                <span className="text-muted-foreground">not set</span>
              )
            }
          />
          <Row
            label="Default harness"
            value={
              project.defaultHarness ? (
                `${project.defaultHarness.name} (v${project.defaultHarness.version})`
              ) : (
                <span className="text-muted-foreground">not set</span>
              )
            }
          />
        </DetailCard>
      </section>

      {project.lastRun && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Latest run</h2>
          <Link
            href={`/dashboard/runs/${project.lastRun.id}`}
            className="mt-2 block rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent"
            data-testid="project-last-run-link"
          >
            <p className="font-mono text-sm">{project.lastRun.id.slice(0, 12)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {project.lastRun.status.toLowerCase()} · started{' '}
              {new Date(project.lastRun.startedAt).toLocaleString()}
            </p>
          </Link>
        </section>
      )}

      <section className="mt-8">
        <Button asChild size="sm">
          <Link href="/dashboard/runs/new">Trigger a new run</Link>
        </Button>
      </section>
    </main>
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

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{value}</dd>
    </div>
  );
}
