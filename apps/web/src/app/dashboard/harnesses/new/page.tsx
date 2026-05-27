import Link from 'next/link';
import { redirect } from 'next/navigation';
import { parse as parseYaml } from 'yaml';
import { auth } from '@/auth';
import { createHarness } from '@/lib/api/harnesses';
import { EditorPageClient } from '../editor-page';

const STARTER_YAML = `# Replace this with your harness definition.
name: 'my-harness'
version: 1
description: ''

steps:
  - id: hello
    type: tool
    use: fs.read
    with:
      path: 'README.md'
`;

async function saveAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/harnesses/new');

  const name = String(formData.get('name') ?? '').trim();
  const yaml = String(formData.get('yaml') ?? '');
  if (!name) redirect('/dashboard/harnesses/new?error=name-required');
  if (!yaml.trim()) redirect('/dashboard/harnesses/new?error=yaml-required');

  let definition: unknown;
  try {
    definition = parseYaml(yaml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'yaml parse failed';
    redirect(`/dashboard/harnesses/new?error=${encodeURIComponent(msg)}`);
  }

  let savedId: string | null = null;
  let saveErr: string | null = null;
  try {
    const created = await createHarness({
      ownerId,
      name,
      definition,
      source: yaml,
    });
    savedId = created.id;
  } catch (e) {
    saveErr = e instanceof Error ? e.message : 'save failed';
  }
  if (saveErr) {
    redirect(`/dashboard/harnesses/new?error=${encodeURIComponent(saveErr)}`);
  }
  redirect(`/dashboard/harnesses/${savedId}`);
}

export default async function NewHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard/harnesses" className="hover:underline">
            ← Harnesses
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">New harness</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          YAML 을 작성하면 우측 panel 에서 zod 검증 결과를 즉시 볼 수 있습니다. Save 는 검증이
          통과해야 활성화됩니다.
        </p>
      </header>

      {error && (
        <p
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="harness-new-error"
        >
          {decodeURIComponent(error)}
        </p>
      )}

      <section className="mt-6">
        <EditorPageClient
          initialYaml={STARTER_YAML}
          initialName="my-harness"
          saveAction={saveAction}
        />
      </section>
    </main>
  );
}
