import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';
import { auth } from '@/auth';
import { listClientsByOwner } from '@/lib/api/clients';
import { listHarnessVersions, listHarnessesByOwner } from '@/lib/api/harnesses';
import { getProject, updateProjectDefaults } from '@/lib/api/projects';
import { DefaultsForm } from './defaults-form';

// Project settings — currently just the default harness / version pin /
// default client triplet (N4 PR8). More fields land as N5+ adds them.
async function saveDefaultsAction(formData: FormData) {
  'use server';
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) redirect('/dashboard');

  const defaultHarnessIdRaw = String(formData.get('defaultHarnessId') ?? '');
  const defaultHarnessVersionRaw = String(formData.get('defaultHarnessVersion') ?? '');
  const defaultClientIdRaw = String(formData.get('defaultClientId') ?? '');

  // "" or "__unset__" means clear; otherwise pass through.
  const patch = {
    defaultHarnessId: defaultHarnessIdRaw === '__unset__' ? null : defaultHarnessIdRaw || undefined,
    defaultHarnessVersion:
      defaultHarnessVersionRaw === '__latest__'
        ? null
        : defaultHarnessVersionRaw
          ? Number(defaultHarnessVersionRaw)
          : undefined,
    defaultClientId: defaultClientIdRaw === '__unset__' ? null : defaultClientIdRaw || undefined,
  };

  let saveErr: string | null = null;
  try {
    await updateProjectDefaults(projectId, patch);
  } catch (e) {
    saveErr = e instanceof Error ? e.message : 'save failed';
  }
  if (saveErr) {
    redirect(`/dashboard/projects/${projectId}/settings?error=${encodeURIComponent(saveErr)}`);
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}/settings?saved=1`);
}

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ id }, { error, saved }, session] = await Promise.all([params, searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=/dashboard/projects/${id}/settings`);

  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  const [harnesses, clients, harnessVersions] = await Promise.all([
    safeListHarnesses(ownerId),
    safeListClients(ownerId),
    project.defaultHarness?.name
      ? safeListHarnessVersions(ownerId, project.defaultHarness.name)
      : Promise.resolve([]),
  ]);

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href={`/dashboard/projects/${id}`} className="hover:underline">
            ← {project.repoFullName}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold" data-testid="project-settings-title">
          Project settings
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Default harness / client / pinned version. Run trigger 가 미지정 default 를 사용할 때
          여기서 정한 값으로 dispatch 됩니다.
        </p>
      </header>

      {error && (
        <p
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="project-settings-error"
        >
          {decodeURIComponent(error)}
        </p>
      )}
      {saved && (
        <p
          className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500"
          data-testid="project-settings-saved"
        >
          저장됨.
        </p>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Defaults
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DefaultsForm
              projectId={id}
              harnesses={harnesses.map((h) => ({ id: h.id, name: h.name, version: h.version }))}
              clients={clients.map((c) => ({
                id: c.id,
                name: c.name,
                status: c.status,
              }))}
              currentHarnessId={project.defaultHarness?.id ?? null}
              currentHarnessVersion={project.defaultHarnessVersion ?? null}
              currentClientId={project.defaultClient?.id ?? null}
              harnessVersionsByCurrentName={harnessVersions.map((v) => v.version)}
              saveAction={saveDefaultsAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              About default version pinning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              <strong>latest</strong>: dispatch resolves to whatever version the harness has at
              run-time. 새 version 을 save 하면 다음 run 부터 자동 적용됩니다.
            </p>
            <p>
              <strong>pinned (v1, v2 …)</strong>: 항상 그 version 의 row 를 사용합니다. 에디터에서
              새 version 을 save 해도 영향 없음 — 안정성 우선.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/projects/${id}`}>← Back to project</Link>
        </Button>
      </section>
    </main>
  );
}

async function safeListHarnesses(ownerId: string) {
  try {
    return await listHarnessesByOwner(ownerId, { latestOnly: true });
  } catch {
    return [];
  }
}
async function safeListClients(ownerId: string) {
  try {
    return await listClientsByOwner(ownerId);
  } catch {
    return [];
  }
}
async function safeListHarnessVersions(ownerId: string, name: string) {
  try {
    return await listHarnessVersions(ownerId, name);
  } catch {
    return [];
  }
}
