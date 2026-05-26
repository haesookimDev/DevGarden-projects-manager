import Link from 'next/link';
import { auth } from '@/auth';
import { listClientsByOwner, type ClientSummary } from '@/lib/api/clients';
import { listHarnessesByOwner, type HarnessSummary } from '@/lib/api/harnesses';
import { listProjectsByOwner, type ProjectSummary } from '@/lib/api/projects';
import { RunTriggerForm } from './run-trigger-form';

export default async function NewRunPage() {
  const session = await auth();
  const ownerId = session?.user?.id;

  let projects: ProjectSummary[] = [];
  let harnesses: HarnessSummary[] = [];
  let clients: ClientSummary[] = [];
  let loadError: string | null = null;

  if (ownerId) {
    try {
      [projects, harnesses, clients] = await Promise.all([
        listProjectsByOwner(ownerId),
        listHarnessesByOwner(ownerId),
        listClientsByOwner(ownerId),
      ]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'failed to load run prerequisites';
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
        <h1 className="mt-2 text-2xl font-semibold">Trigger a new harness run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          선택한 클라이언트가 ONLINE 이어야 실 실행됩니다. OFFLINE 이어도 QUEUED 로 생성은 됩니다.
        </p>
      </header>

      {loadError && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      )}

      <Prereqs projects={projects} harnesses={harnesses} clients={clients} />

      <RunTriggerForm projects={projects} harnesses={harnesses} clients={clients} />
    </main>
  );
}

function Prereqs({
  projects,
  harnesses,
  clients,
}: {
  projects: ProjectSummary[];
  harnesses: HarnessSummary[];
  clients: ClientSummary[];
}) {
  const missing: Array<{ label: string; href: string | null }> = [];
  if (projects.length === 0) missing.push({ label: 'project', href: '/dashboard/projects/new' });
  if (harnesses.length === 0) missing.push({ label: 'harness', href: null });
  if (clients.length === 0) missing.push({ label: 'client', href: '/dashboard/clients/new' });
  if (missing.length === 0) return null;

  return (
    <section
      data-testid="run-trigger-prereq-warning"
      className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500"
    >
      <p className="font-medium">먼저 다음 항목을 만들어야 합니다:</p>
      <ul className="mt-1 list-inside list-disc">
        {missing.map((m) => (
          <li key={m.label}>
            {m.label}
            {m.href && (
              <>
                {' '}
                —{' '}
                <Link href={m.href} className="underline hover:text-amber-400">
                  생성 페이지로
                </Link>
              </>
            )}
            {!m.href && (
              <span className="ml-1 opacity-70">
                (UI 미구현 — 현재는 api 직접 호출 또는 seed 필요)
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
