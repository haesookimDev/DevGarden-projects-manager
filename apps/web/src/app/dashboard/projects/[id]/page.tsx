import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  Play,
  Settings,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';

import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { getHarness } from '@/lib/api/harnesses';
import { listPresetsByProject, triggerPresetRun, type PresetRow } from '@/lib/api/presets';
import { getProject, type CloneStatus, type ProjectDetail } from '@/lib/api/projects';
import { listRunsByProject, type RunSummary } from '@/lib/api/runs';
import { listTodosByOwner, type TodoRow } from '@/lib/api/todos';

// Quick-action server action: trigger the project's default preset (or the
// first preset if none is marked default). Redirects to the new run's detail
// page so the operator follows logs directly.
async function runDefaultPresetAction(formData: FormData) {
  'use server';
  const projectId = String(formData.get('projectId') ?? '');
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/signin?callbackUrl=/dashboard/projects/${projectId}`);
  if (!projectId) redirect('/dashboard');

  const presets = await listPresetsByProject(projectId);
  const target = presets.find((p) => p.isDefault) ?? presets[0];
  if (!target) {
    redirect(`/dashboard/projects/${projectId}/presets?error=no-preset`);
  }
  let runId: string | null = null;
  let runErr: string | null = null;
  try {
    const run = await triggerPresetRun(target.id, userId);
    runId = run.id;
  } catch (e) {
    runErr = e instanceof Error ? e.message : 'unknown';
  }
  if (runErr) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent(runErr)}`);
  }
  redirect(`/dashboard/runs/${runId}`);
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, session] = await Promise.all([params, searchParams, auth()]);
  const ownerId = session?.user?.id;

  let project: ProjectDetail;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  // Fetch the side panels in parallel. Each section degrades to its own empty
  // state on failure rather than failing the whole page.
  const [recentRuns, openIssues, presets, defaultHarness] = await Promise.all([
    safeListRuns(project.id),
    ownerId ? safeListIssues(ownerId, project.id) : Promise.resolve([] as TodoRow[]),
    safeListPresets(project.id),
    project.defaultHarness?.id ? safeGetHarness(project.defaultHarness.id) : Promise.resolve(null),
  ]);

  const githubUrl = `https://github.com/${project.repoFullName}`;

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" data-testid="project-detail-name">
            {project.repoFullName}
          </h1>
          <CloneStatusBadge status={project.cloneStatus} projectId={project.id} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          installation #{project.githubInstallationId} · repo #{project.githubRepoId} ·{' '}
          <code className="font-mono">{project.localRoot}</code>
        </p>
        {project.cloneError && project.cloneStatus === 'FAILED' && (
          <p
            className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-testid="project-clone-error"
          >
            Clone failed: {project.cloneError}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {decodeURIComponent(error)}
          </p>
        )}
      </header>

      <section className="mt-6 flex flex-wrap gap-2" data-testid="project-quick-actions">
        <form action={runDefaultPresetAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <Button
            type="submit"
            size="sm"
            disabled={presets.length === 0}
            data-testid="project-action-run-preset"
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Run default preset
          </Button>
        </form>
        <Button asChild size="sm" variant="outline" data-testid="project-action-presets">
          <Link href={`/dashboard/projects/${project.id}/presets`}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Manage presets
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" data-testid="project-action-github">
          <a href={githubUrl} target="_blank" rel="noreferrer">
            Open on GitHub
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" data-testid="project-action-clone-status">
          <Link href={`/dashboard/projects/${project.id}/clone-status`}>
            <GitBranch className="mr-1.5 h-3.5 w-3.5" />
            Clone status
          </Link>
        </Button>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentRunsCard runs={recentRuns} />
        <OpenIssuesCard issues={openIssues} projectId={project.id} />
        <DefaultHarnessCard
          harness={defaultHarness}
          fallbackHarnessName={project.defaultHarness?.name ?? null}
        />
        <PresetsCard presets={presets} projectId={project.id} />
      </section>
    </main>
  );
}

function CloneStatusBadge({ status, projectId }: { status: CloneStatus; projectId: string }) {
  switch (status) {
    case 'READY':
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          data-testid="project-clone-badge-ready"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" /> cloned
        </Badge>
      );
    case 'CLONING':
      return (
        <Link href={`/dashboard/projects/${projectId}/clone-status`}>
          <Badge variant="outline" data-testid="project-clone-badge-cloning">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> cloning…
          </Badge>
        </Link>
      );
    case 'FAILED':
      return (
        <Link href={`/dashboard/projects/${projectId}/clone-status`}>
          <Badge
            variant="outline"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="project-clone-badge-failed"
          >
            <AlertTriangle className="mr-1 h-3 w-3" /> clone failed
          </Badge>
        </Link>
      );
    case 'NOT_CLONED':
      return (
        <Badge variant="outline" data-testid="project-clone-badge-not-cloned">
          not cloned
        </Badge>
      );
  }
}

function RecentRunsCard({ runs }: { runs: RunSummary[] }) {
  return (
    <Card data-testid="project-card-runs">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent runs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            description="“Run default preset” 를 누르거나 /dashboard/runs/new 에서 한 번 실행해 보세요."
            testId="project-runs-empty"
          />
        ) : (
          <ul className="space-y-1.5">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/runs/${r.id}`}
                  className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-accent"
                  data-testid="project-run-link"
                >
                  <span className="font-mono text-xs">{r.id.slice(0, 12)}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.status.toLowerCase()} · {new Date(r.startedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OpenIssuesCard({ issues, projectId }: { issues: TodoRow[]; projectId: string }) {
  return (
    <Card data-testid="project-card-issues">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open issues
        </CardTitle>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <EmptyState
            title="No mirrored issues"
            description="GitHub issues 가 webhook 으로 동기화되면 여기에 표시됩니다."
            testId="project-issues-empty"
          />
        ) : (
          <ul className="space-y-1.5">
            {issues.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-accent"
                data-testid="project-issue-row"
              >
                <span className="flex-1 truncate">
                  {t.sourceRef ? (
                    <span className="text-muted-foreground">#{t.sourceRef} </span>
                  ) : null}
                  {t.title}
                </span>
                <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                  <Link
                    href={`/dashboard/projects/${projectId}/presets?fromIssue=${t.id}`}
                    data-testid="project-issue-run-link"
                  >
                    Run as task
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DefaultHarnessCard({
  harness,
  fallbackHarnessName,
}: {
  harness: { name: string; version: number; definition: unknown } | null;
  fallbackHarnessName: string | null;
}) {
  return (
    <Card data-testid="project-card-harness">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Default harness
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!harness ? (
          <EmptyState
            title={fallbackHarnessName ? `${fallbackHarnessName} (not loadable)` : 'No default'}
            description="Project settings 에서 default harness 를 지정하면 미리보기가 나타납니다."
            testId="project-harness-empty"
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {harness.name} <span className="text-muted-foreground">v{harness.version}</span>
            </p>
            <HarnessStepsPreview definition={harness.definition} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HarnessStepsPreview({ definition }: { definition: unknown }) {
  const steps = extractSteps(definition);
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground">(definition 에 steps 가 없습니다)</p>;
  }
  return (
    <ul className="space-y-1 text-xs text-muted-foreground" data-testid="project-harness-steps">
      {steps.slice(0, 5).map((s, i) => (
        <li key={`${s.id ?? i}`} className="flex gap-2">
          <span className="font-mono text-[10px] text-muted-foreground/70">{i + 1}.</span>
          <span>
            <span className="font-mono">{s.id ?? '(unnamed)'}</span>
            {s.use ? <span className="text-muted-foreground/70"> · {s.use}</span> : null}
          </span>
        </li>
      ))}
      {steps.length > 5 && (
        <li className="text-[11px] text-muted-foreground/70">+ {steps.length - 5} more</li>
      )}
    </ul>
  );
}

function PresetsCard({ presets, projectId }: { presets: PresetRow[]; projectId: string }) {
  return (
    <Card data-testid="project-card-presets">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Run presets
        </CardTitle>
      </CardHeader>
      <CardContent>
        {presets.length === 0 ? (
          <EmptyState
            title="No presets"
            description="자주 쓰는 (harness + client + inputs) 조합을 preset 으로 저장해 한 번에 trigger 하세요."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/projects/${projectId}/presets`}>Manage presets</Link>
              </Button>
            }
            testId="project-presets-empty"
          />
        ) : (
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-accent"
                data-testid="project-preset-row"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isDefault && (
                    <Badge variant="outline" className="text-[10px]">
                      default
                    </Badge>
                  )}
                </span>
                <Link
                  href={`/dashboard/projects/${projectId}/presets`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  edit →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface StepSummary {
  id?: string;
  use?: string;
}

function extractSteps(definition: unknown): StepSummary[] {
  if (!definition || typeof definition !== 'object') return [];
  const steps = (definition as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => {
    if (!s || typeof s !== 'object') return {};
    return {
      id: typeof (s as { id?: unknown }).id === 'string' ? (s as { id: string }).id : undefined,
      use:
        typeof (s as { use?: unknown }).use === 'string' ? (s as { use: string }).use : undefined,
    };
  });
}

async function safeListRuns(projectId: string): Promise<RunSummary[]> {
  try {
    return await listRunsByProject(projectId);
  } catch {
    return [];
  }
}

async function safeListIssues(ownerId: string, projectId: string): Promise<TodoRow[]> {
  try {
    return await listTodosByOwner(ownerId, {
      projectId,
      source: 'GITHUB_ISSUE',
      status: 'OPEN',
      limit: 10,
    });
  } catch {
    return [];
  }
}

async function safeListPresets(projectId: string): Promise<PresetRow[]> {
  try {
    return await listPresetsByProject(projectId);
  } catch {
    return [];
  }
}

async function safeGetHarness(id: string) {
  try {
    return await getHarness(id);
  } catch {
    return null;
  }
}
