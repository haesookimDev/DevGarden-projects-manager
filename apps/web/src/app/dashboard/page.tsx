import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { listClientsByOwner, type ClientSummary } from '@/lib/api/clients';
import { listProjectsByOwner, type ProjectSummary } from '@/lib/api/projects';
import { FolderKanban } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardTitle } from '@devgarden/ui';
import { EmptyState } from '@/components/empty-state';
import { ClientList } from './clients/client-list';

export default async function DashboardPage() {
  const session = await auth();
  const ownerId = session?.user?.id;

  let projects: ProjectSummary[] = [];
  let listError: string | null = null;
  let clients: ClientSummary[] = [];
  let clientsError: string | null = null;
  if (ownerId) {
    try {
      projects = await listProjectsByOwner(ownerId);
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Failed to load projects';
    }
    try {
      clients = await listClientsByOwner(ownerId);
    } catch (e) {
      clientsError = e instanceof Error ? e.message : 'Failed to load clients';
    }
  }

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/harnesses" data-testid="dashboard-harnesses-cta">
              Harnesses
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/webhooks" data-testid="dashboard-webhooks-cta">
              Webhooks
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/insights" data-testid="dashboard-insights-cta">
              Insights
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/github" data-testid="dashboard-settings-github-cta">
              GitHub settings
            </Link>
          </Button>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <section className="mt-6">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-1 text-lg font-medium">
          {session?.user?.login ?? session?.user?.name ?? 'unknown'}
        </p>
        <p className="text-sm text-muted-foreground">github id: {session?.user?.githubId ?? '?'}</p>
      </section>

      <Card className="mt-8 flex flex-row items-center justify-between p-4">
        <div>
          <CardTitle className="text-base">Trigger a harness run</CardTitle>
          <CardDescription className="text-xs">
            project · harness · client 을 선택해 즉시 큐에 넣습니다.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/tasks" data-testid="dashboard-tasks-cta">
              Tasks
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/runs" data-testid="dashboard-runs-history-cta">
              History
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/runs/new" data-testid="dashboard-new-run-cta">
              New run
            </Link>
          </Button>
        </div>
      </Card>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Button asChild size="sm">
            <Link href="/dashboard/projects/new">Add project</Link>
          </Button>
        </div>

        {listError && (
          <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </p>
        )}

        {!listError && projects.length === 0 && (
          <EmptyState
            className="mt-3"
            icon={FolderKanban}
            title="등록된 프로젝트가 없습니다"
            description="우상단의 “Add project” 를 눌러 첫 프로젝트를 등록하세요."
            testId="dashboard-projects-empty"
          />
        )}

        {projects.length > 0 && (
          <Card className="mt-3 overflow-hidden p-0">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/projects/${p.id}`}
                      data-testid="project-list-row"
                      className="block px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <p className="font-medium">{p.repoFullName}</p>
                      <p className="text-xs text-muted-foreground">
                        installation #{p.githubInstallationId} · local: {p.localRoot}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Clients</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/clients/new">Add client</Link>
          </Button>
        </div>
        {clientsError && (
          <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {clientsError}
          </p>
        )}
        {!clientsError && <ClientList initial={clients} />}
      </section>
    </main>
  );
}
