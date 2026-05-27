import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@devgarden/ui';
import { Github } from 'lucide-react';

import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { listClientsByOwner, type ClientSummary } from '@/lib/api/clients';
import {
  listInstallationsFromDb,
  listReposForInstallation,
  type GithubInstallation,
  type GithubRepo,
} from '@/lib/api/github';
import { createProject, dispatchClone } from '@/lib/api/projects';
import { CloneOnCreateSection } from './clone-on-create';
import { InstallationSwitcher } from './installation-switcher';
import { RepoPicker } from './repo-picker';

const DEFAULT_WORKSPACE_ROOT = process.env.DEVGARDEN_WORKSPACE_ROOT ?? '/tmp/devgarden';

async function createProjectAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    redirect('/signin?callbackUrl=/dashboard/projects/new');
  }

  const repoFullName = String(formData.get('repoFullName') ?? '').trim();
  const installationIdRaw = String(formData.get('installationId') ?? '').trim();
  const installationDbId = String(formData.get('installationDbId') ?? '').trim();
  const localRoot = String(formData.get('localRoot') ?? '').trim();
  const cloneOnCreate = formData.get('cloneOnCreate') === 'on';
  const useWorktrees = formData.get('useWorktrees') === 'on';
  const cloneClientId = String(formData.get('cloneClientId') ?? '').trim();

  if (!repoFullName || !installationIdRaw || !installationDbId || !localRoot) {
    redirect('/dashboard/projects/new?error=missing-fields');
  }
  const installationId = Number(installationIdRaw);
  if (!Number.isFinite(installationId)) {
    redirect('/dashboard/projects/new?error=invalid-installation-id');
  }
  if (!repoFullName.includes('/')) {
    redirect('/dashboard/projects/new?error=invalid-repo');
  }
  if (!localRoot.startsWith('/')) {
    redirect('/dashboard/projects/new?error=local-root-must-be-absolute');
  }
  if (cloneOnCreate && !cloneClientId) {
    redirect('/dashboard/projects/new?error=clone-client-required');
  }

  let projectId: string;
  try {
    const created = await createProject({
      ownerId,
      installationId,
      installationDbId,
      repoFullName,
      localRoot,
    });
    projectId = created.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/dashboard/projects/new?error=${encodeURIComponent(msg)}`);
  }

  if (cloneOnCreate) {
    try {
      await dispatchClone({
        projectId,
        clientId: cloneClientId,
        targetPath: localRoot,
        useWorktrees,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      // Project row exists — point the user at the clone-status page so they
      // can retry from there without re-entering the create form.
      redirect(`/dashboard/projects/${projectId}/clone-status?error=${encodeURIComponent(msg)}`);
    }
    redirect(`/dashboard/projects/${projectId}/clone-status`);
  }
  redirect('/dashboard');
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; installationDbId?: string }>;
}) {
  const { error, installationDbId: selectedDbId } = await searchParams;
  const session = await auth();
  const ownerId = session?.user?.id;

  let installations: GithubInstallation[] = [];
  let installationsError: string | null = null;
  let clients: ClientSummary[] = [];
  if (ownerId) {
    try {
      installations = await listInstallationsFromDb(ownerId);
    } catch (e) {
      installationsError = e instanceof Error ? e.message : 'failed to load installations';
    }
    try {
      clients = await listClientsByOwner(ownerId);
    } catch {
      // Non-fatal — clone-on-create just stays disabled when we can't list
      // paired clients. Surfacing this is overkill for the create form.
      clients = [];
    }
  }

  const currentInstallation = installations.find((i) => i.id === selectedDbId) ?? installations[0];

  let repos: GithubRepo[] = [];
  let reposError: string | null = null;
  if (currentInstallation) {
    try {
      repos = await listReposForInstallation(currentInstallation.id);
    } catch (e) {
      reposError = e instanceof Error ? e.message : 'failed to load repos';
    }
  }

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">Add project</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      )}
      {installationsError && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {installationsError}
        </p>
      )}

      {!currentInstallation ? (
        <EmptyState
          className="mt-6"
          icon={Github}
          title="설치된 GitHub App 이 없습니다"
          description="먼저 onboarding 에서 GitHub App 을 등록하고 본인 또는 조직 계정에 설치하세요."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/onboarding" data-testid="project-new-onboarding-cta">
                Go to onboarding →
              </Link>
            </Button>
          }
          testId="project-new-no-installation"
        />
      ) : (
        <form
          action={createProjectAction}
          className="mt-6 max-w-xl space-y-4"
          data-testid="project-new-form"
        >
          {/* Hidden fields backing the picker selections. */}
          <input type="hidden" name="installationDbId" value={currentInstallation.id} />
          <input
            type="hidden"
            name="installationId"
            value={String(currentInstallation.installationId)}
          />

          {installations.length > 1 ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="project-new-installation-trigger">
                Installation
              </label>
              <InstallationSwitcher
                installations={installations.map((i) => ({
                  id: i.id,
                  accountLogin: i.accountLogin,
                  accountType: i.accountType,
                }))}
                current={currentInstallation.id}
              />
            </div>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="project-new-installation-single"
            >
              Installation: <span className="font-medium">{currentInstallation.accountLogin}</span>{' '}
              ({currentInstallation.accountType.toLowerCase()})
            </p>
          )}

          {reposError && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {reposError}
            </p>
          )}

          <RepoPicker repos={repos} defaultWorkspaceRoot={DEFAULT_WORKSPACE_ROOT} />

          <CloneOnCreateSection clients={clients} />

          <Button type="submit" data-testid="project-new-submit">
            Create
          </Button>
        </form>
      )}
    </main>
  );
}
