import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Label } from '@devgarden/ui';
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

        <Button type="submit">Create</Button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        Installation ID 는 GitHub App 설치 후 발급됩니다. 찾는 방법:{' '}
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
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
  const id = `field-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="text" placeholder={placeholder} required={required} />
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
