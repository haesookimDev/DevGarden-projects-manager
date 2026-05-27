import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';
import { auth } from '@/auth';
import { createHarness, getHarness, listHarnessVersions } from '@/lib/api/harnesses';
import { EditorPageClient } from '../editor-page';

async function saveAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin');

  const name = String(formData.get('name') ?? '').trim();
  const yaml = String(formData.get('yaml') ?? '');
  if (!name || !yaml.trim()) redirect('/dashboard/harnesses');

  let definition: unknown;
  try {
    definition = parseYaml(yaml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'yaml parse failed';
    redirect(`/dashboard/harnesses?error=${encodeURIComponent(msg)}`);
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
    redirect(`/dashboard/harnesses?error=${encodeURIComponent(saveErr)}`);
  }
  redirect(`/dashboard/harnesses/${savedId}`);
}

export default async function HarnessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=/dashboard/harnesses/${id}`);

  let harness;
  try {
    harness = await getHarness(id);
  } catch {
    notFound();
  }

  // Stringify the stored JSON definition back to yaml so the editor opens
  // with the saved content. `source` is also stored — prefer that when
  // available so comments/spacing are preserved.
  const yaml =
    (harness as { source?: string | null }).source ??
    stringifyYaml(harness.definition, { indent: 2 });

  // Version history sidebar — every saved version under the same (owner, name).
  let versions: Awaited<ReturnType<typeof listHarnessVersions>> = [];
  try {
    versions = await listHarnessVersions(ownerId, harness.name);
  } catch {
    versions = [];
  }

  const isLatest = versions[0]?.id === harness.id;

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard/harnesses" className="hover:underline">
            ← Harnesses
          </Link>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-2xl font-semibold" data-testid="harness-detail-name">
            {harness.name}
          </h1>
          <Badge variant="outline" className="text-xs">
            v{harness.version}
          </Badge>
          {!isLatest && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-xs text-amber-500"
              data-testid="harness-detail-stale"
            >
              older version
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          last updated {new Date(harness.updatedAt).toLocaleString()} · id{' '}
          <code className="font-mono">{harness.id}</code>
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <EditorPageClient
          initialYaml={yaml}
          initialName={harness.name}
          lockName
          saveAction={saveAction}
        />
        <VersionHistoryCard
          currentId={harness.id}
          versions={versions.map((v) => ({
            id: v.id,
            version: v.version,
            updatedAt: v.updatedAt,
          }))}
        />
      </section>
    </main>
  );
}

interface VersionRow {
  id: string;
  version: number;
  updatedAt: string;
}

function VersionHistoryCard({
  currentId,
  versions,
}: {
  currentId: string;
  versions: VersionRow[];
}) {
  return (
    <Card data-testid="harness-version-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Versions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {versions.map((v) => {
            const isCurrent = v.id === currentId;
            return (
              <li key={v.id}>
                <Link
                  href={`/dashboard/harnesses/${v.id}`}
                  className={
                    'flex items-center justify-between rounded-md border px-2 py-1.5 text-sm transition-colors ' +
                    (isCurrent
                      ? 'border-foreground/30 bg-accent'
                      : 'border-transparent hover:border-border hover:bg-accent')
                  }
                  data-testid="harness-version-row"
                  data-current={isCurrent ? '1' : '0'}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      v{v.version}
                    </Badge>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(v.updatedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
