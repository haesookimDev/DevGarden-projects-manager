import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Play, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';

import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { listClientsByOwner, type ClientSummary } from '@/lib/api/clients';
import { listHarnessesByOwner, type HarnessSummary } from '@/lib/api/harnesses';
import {
  createPreset,
  deletePreset,
  listPresetsByProject,
  triggerPresetRun,
  type PresetRow,
} from '@/lib/api/presets';
import { getProject } from '@/lib/api/projects';

// Server action: create a new preset. Reads the form fields, validates
// JSON inputs, and calls the api. On failure we redirect back to the page
// with the error in the query string so the form keeps the user's data
// in view (the inline form is uncontrolled, so the values persist).
async function createPresetAction(formData: FormData) {
  'use server';
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const harnessId = String(formData.get('harnessId') ?? '').trim();
  const clientId = String(formData.get('clientId') ?? '').trim();
  const inputsRaw = String(formData.get('inputs') ?? '').trim();
  const isDefault = formData.get('isDefault') === 'on';

  if (!projectId) redirect('/dashboard');
  const back = `/dashboard/projects/${projectId}/presets`;
  if (!name || !harnessId || !clientId) {
    redirect(`${back}?error=missing-fields`);
  }

  let inputs: unknown = {};
  if (inputsRaw) {
    try {
      inputs = JSON.parse(inputsRaw);
    } catch {
      redirect(`${back}?error=invalid-inputs-json`);
    }
  }

  let createErr: string | null = null;
  try {
    await createPreset({ projectId, name, harnessId, clientId, inputs, isDefault });
  } catch (e) {
    createErr = e instanceof Error ? e.message : 'unknown';
  }
  if (createErr) redirect(`${back}?error=${encodeURIComponent(createErr)}`);
  revalidatePath(back);
  redirect(back);
}

async function deletePresetAction(formData: FormData) {
  'use server';
  const id = String(formData.get('presetId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  if (!id || !projectId) redirect('/dashboard');
  let delErr: string | null = null;
  try {
    await deletePreset(id);
  } catch (e) {
    delErr = e instanceof Error ? e.message : 'unknown';
  }
  if (delErr) {
    redirect(`/dashboard/projects/${projectId}/presets?error=${encodeURIComponent(delErr)}`);
  }
  revalidatePath(`/dashboard/projects/${projectId}/presets`);
  redirect(`/dashboard/projects/${projectId}/presets`);
}

async function triggerPresetAction(formData: FormData) {
  'use server';
  const id = String(formData.get('presetId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  if (!id || !projectId) redirect('/dashboard');
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/signin?callbackUrl=/dashboard/projects/${projectId}/presets`);

  let runId: string | null = null;
  let runErr: string | null = null;
  try {
    const run = await triggerPresetRun(id, userId);
    runId = run.id;
  } catch (e) {
    runErr = e instanceof Error ? e.message : 'unknown';
  }
  if (runErr) {
    redirect(`/dashboard/projects/${projectId}/presets?error=${encodeURIComponent(runErr)}`);
  }
  redirect(`/dashboard/runs/${runId}`);
}

export default async function ProjectPresetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; fromIssue?: string }>;
}) {
  const [{ id }, { error, fromIssue }, session] = await Promise.all([params, searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=/dashboard/projects/${id}/presets`);

  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  const [presets, harnesses, clients] = await Promise.all([
    safeListPresets(id),
    safeListHarnesses(ownerId),
    safeListClients(ownerId),
  ]);

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href={`/dashboard/projects/${id}`} className="hover:underline">
            ← {project.repoFullName}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold" data-testid="presets-title">
          Run presets
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          자주 쓰는 (harness + client + inputs) 조합을 저장하면 한 번에 실행할 수 있습니다.
        </p>
      </header>

      {error && (
        <p
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="presets-error"
        >
          {decodeURIComponent(error)}
        </p>
      )}

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreatePresetCard
          projectId={id}
          harnesses={harnesses}
          clients={clients}
          fromIssue={fromIssue ?? null}
        />
        <PresetListCard projectId={id} presets={presets} />
      </section>
    </main>
  );
}

function CreatePresetCard({
  projectId,
  harnesses,
  clients,
  fromIssue,
}: {
  projectId: string;
  harnesses: HarnessSummary[];
  clients: ClientSummary[];
  fromIssue: string | null;
}) {
  const noHarness = harnesses.length === 0;
  const noClient = clients.length === 0;
  return (
    <Card data-testid="presets-create-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create preset
        </CardTitle>
      </CardHeader>
      <CardContent>
        {noHarness || noClient ? (
          <EmptyState
            title={noHarness ? 'No harness defined' : 'No paired client'}
            description={
              noHarness
                ? '먼저 harness 를 하나 만들어야 preset 으로 묶을 수 있습니다.'
                : '먼저 desktop client 를 페어링해야 preset 이 어디서 실행될지 결정할 수 있습니다.'
            }
            testId="presets-create-blocked"
          />
        ) : (
          <form action={createPresetAction} className="space-y-3" data-testid="presets-create-form">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="space-y-1.5">
              <Label htmlFor="presets-create-name">Name</Label>
              <Input
                id="presets-create-name"
                name="name"
                required
                defaultValue={fromIssue ? `issue-${fromIssue}` : ''}
                data-testid="presets-create-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="presets-create-harness">Harness</Label>
                <Select name="harnessId">
                  <SelectTrigger id="presets-create-harness" data-testid="presets-create-harness">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {harnesses.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name} v{h.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="presets-create-client">Client</Label>
                <Select name="clientId">
                  <SelectTrigger id="presets-create-client" data-testid="presets-create-client">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.status.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="presets-create-inputs">Inputs (JSON)</Label>
              <textarea
                id="presets-create-inputs"
                name="inputs"
                rows={4}
                defaultValue={
                  fromIssue ? `{\n  "issueNumber": ${JSON.stringify(fromIssue)}\n}` : ''
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder='{"branch": "main"}'
                data-testid="presets-create-inputs"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" data-testid="presets-create-default" />
              Set as default
            </label>
            <Button type="submit" size="sm" data-testid="presets-create-submit">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Save preset
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PresetListCard({ projectId, presets }: { projectId: string; presets: PresetRow[] }) {
  return (
    <Card data-testid="presets-list-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Saved presets
        </CardTitle>
      </CardHeader>
      <CardContent>
        {presets.length === 0 ? (
          <EmptyState
            title="No presets yet"
            description="왼쪽 form 으로 첫 preset 을 만드세요."
            testId="presets-list-empty"
          />
        ) : (
          <ul className="space-y-3" data-testid="presets-list">
            {presets.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-border p-3"
                data-testid="presets-list-row"
                data-preset-id={p.id}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.isDefault && (
                      <Badge variant="outline" className="text-[10px]">
                        default
                      </Badge>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <form action={triggerPresetAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="presetId" value={p.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        data-testid="presets-row-trigger"
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Run
                      </Button>
                    </form>
                    <form action={deletePresetAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="presetId" value={p.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        data-testid="presets-row-delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </div>
                <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] font-mono">
                  {JSON.stringify(p.inputs, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function safeListPresets(projectId: string): Promise<PresetRow[]> {
  try {
    return await listPresetsByProject(projectId);
  } catch {
    return [];
  }
}

async function safeListHarnesses(ownerId: string): Promise<HarnessSummary[]> {
  try {
    return await listHarnessesByOwner(ownerId);
  } catch {
    return [];
  }
}

async function safeListClients(ownerId: string): Promise<ClientSummary[]> {
  try {
    return await listClientsByOwner(ownerId);
  } catch {
    return [];
  }
}
