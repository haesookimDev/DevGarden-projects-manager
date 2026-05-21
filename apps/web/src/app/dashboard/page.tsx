import { auth, signOut } from '@/auth';

export default async function DashboardPage() {
  const session = await auth();

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

      <section className="mt-8 text-sm text-neutral-500">
        프로젝트 추가·하네스 실행 UI는 다음 PR에서 추가됩니다.
      </section>
    </main>
  );
}
