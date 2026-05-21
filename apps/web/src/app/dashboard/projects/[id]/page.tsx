import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/api/projects';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  return (
    <main className="p-8">
      <header className="border-b border-neutral-800 pb-4">
        <p className="text-sm text-neutral-400">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold" data-testid="project-detail-name">
          {project.repoFullName}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
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
        <Card title="Configuration">
          <Row label="Local root" value={<code className="font-mono text-xs">{project.localRoot}</code>} />
          <Row label="Worktree policy" value={project.worktreePolicy.toLowerCase()} />
          <Row label="Created" value={new Date(project.createdAt).toLocaleString()} />
          <Row label="Updated" value={new Date(project.updatedAt).toLocaleString()} />
        </Card>

        <Card title="Defaults">
          <Row
            label="Default client"
            value={
              project.defaultClient
                ? `${project.defaultClient.name} (${project.defaultClient.status.toLowerCase()})`
                : <span className="text-neutral-500">not set</span>
            }
          />
          <Row
            label="Default harness"
            value={
              project.defaultHarness
                ? `${project.defaultHarness.name} (v${project.defaultHarness.version})`
                : <span className="text-neutral-500">not set</span>
            }
          />
        </Card>
      </section>

      {project.lastRun && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Latest run</h2>
          <Link
            href={`/dashboard/runs/${project.lastRun.id}`}
            className="mt-2 block rounded-md border border-neutral-800 px-4 py-3 hover:bg-neutral-900"
            data-testid="project-last-run-link"
          >
            <p className="font-mono text-sm">{project.lastRun.id.slice(0, 12)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {project.lastRun.status.toLowerCase()} · started{' '}
              {new Date(project.lastRun.startedAt).toLocaleString()}
            </p>
          </Link>
        </section>
      )}

      <section className="mt-8">
        <Link
          href="/dashboard/runs/new"
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
        >
          Trigger a new run
        </Link>
      </section>
    </main>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-800 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="col-span-2">{value}</dd>
    </div>
  );
}
