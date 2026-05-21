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
          placeholder="/Users/me/repos/hello-world"
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
        Installation ID 는 GitHub App 설치 후 발급됩니다 (자동 picker UI는 다음 PR에서 추가).
      </p>
    </main>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
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
    </label>
  );
}
