import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { listProjectsByOwner, type ProjectSummary } from '@/lib/api/projects';

export default async function DashboardPage() {
  const session = await auth();
  const ownerId = session?.user?.id;

  let projects: ProjectSummary[] = [];
  let listError: string | null = null;
  if (ownerId) {
    try {
      projects = await listProjectsByOwner(ownerId);
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Failed to load projects';
    }
  }

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-6">
        <p className="text-sm text-neutral-400">Signed in as</p>
        <p className="mt-1 text-lg font-medium">
          {session?.user?.login ?? session?.user?.name ?? 'unknown'}
        </p>
        <p className="text-sm text-neutral-500">github id: {session?.user?.githubId ?? '?'}</p>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Link
            href="/dashboard/projects/new"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
          >
            Add project
          </Link>
        </div>

        {listError && (
          <p className="mt-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
            {listError}
          </p>
        )}

        {!listError && projects.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            아직 등록된 프로젝트가 없습니다. &ldquo;Add project&rdquo; 를 눌러 시작하세요.
          </p>
        )}

        {projects.length > 0 && (
          <ul className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800">
            {projects.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <p className="font-medium">{p.repoFullName}</p>
                <p className="text-xs text-neutral-500">
                  installation #{p.githubInstallationId} · local: {p.localRoot}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Clients</h2>
          <Link
            href="/dashboard/clients/new"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Add client
          </Link>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          데스크탑 클라이언트 페어링은 토큰 발급 후 클라이언트 앱에서 완료합니다. 등록된 클라이언트
          목록 UI 는 다음 PR 에서 추가됩니다.
        </p>
      </section>
    </main>
  );
}
