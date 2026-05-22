import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { createProject } from '@/lib/api/projects';

async function createProjectAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    redirect('/signin?callbackUrl=/dashboard/projects/new');
  }

  const repoFullName = String(formData.get('repoFullName') ?? '').trim();
  const installationIdRaw = String(formData.get('installationId') ?? '').trim();
  const localRoot = String(formData.get('localRoot') ?? '').trim();

  if (!repoFullName || !installationIdRaw || !localRoot) {
    redirect('/dashboard/projects/new?error=missing-fields');
  }
  const installationId = Number(installationIdRaw);
  if (!Number.isFinite(installationId)) {
    redirect('/dashboard/projects/new?error=invalid-installation-id');
  }
  if (!repoFullName.includes('/')) {
    redirect('/dashboard/projects/new?error=invalid-repo');
  }
  // localRoot must be an absolute path: PathPolicy uses path.resolve() and
  // a relative root would silently rebase against the client process cwd,
  // which is almost never what the user wants.
  if (!localRoot.startsWith('/')) {
    redirect('/dashboard/projects/new?error=local-root-must-be-absolute');
  }

  try {
    await createProject({ ownerId, installationId, repoFullName, localRoot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/dashboard/projects/new?error=${encodeURIComponent(msg)}`);
  }
  redirect('/dashboard');
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold">Add project</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Dashboard
        </Link>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
          {decodeURIComponent(error)}
        </p>
      )}

      <form action={createProjectAction} className="mt-6 max-w-xl space-y-4">
        <Field
          label="Repository (owner/name)"
          name="repoFullName"
          placeholder="octocat/Hello-World"
          required
        />
        <Field
          label="GitHub App installation ID"
          name="installationId"
          placeholder="12345678"
          required
        />
        <Field
          label="Local working directory"
          name="localRoot"
          placeholder="/Users/me/devgarden-workspaces/hello-world"
          helper="데스크탑 클라이언트가 동작하는 머신에서 이 repo 를 clone 해둔 절대 경로. 자동 clone 은 없으므로 먼저 git clone 후 그 경로를 넣어주세요. 모든 fs/git/process 도구는 이 디렉터리 안에서만 동작합니다 (sandbox)."
          required
        />

        <button
          type="submit"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
        >
          Create
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        Installation ID 는 GitHub App 설치 후 발급됩니다. 찾는 방법:{' '}
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-neutral-300"
        >
          github.com/settings/installations
        </a>{' '}
        → 해당 App 의 &ldquo;Configure&rdquo; 클릭 → URL 끝의 숫자.
      </p>
    </main>
  );
}

function Field({
  label,
  name,
  placeholder,
  helper,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  helper?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-300">{label}</span>
      <input
        name={name}
        type="text"
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
      />
      {helper && <p className="mt-1 text-xs text-neutral-500">{helper}</p>}
    </label>
  );
}
