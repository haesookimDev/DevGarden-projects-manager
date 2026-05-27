import { internalFetch } from './internal';
import type { RunSummary } from './runs';

export interface PresetRow {
  id: string;
  projectId: string;
  name: string;
  harnessId: string;
  clientId: string;
  inputs: unknown;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresetInput {
  projectId: string;
  name: string;
  harnessId: string;
  clientId: string;
  inputs?: unknown;
  isDefault?: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  harnessId?: string;
  clientId?: string;
  inputs?: unknown;
  isDefault?: boolean;
}

export async function listPresetsByProject(projectId: string): Promise<PresetRow[]> {
  const res = await internalFetch(
    `/internal/projects/${encodeURIComponent(projectId)}/presets`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listPresetsByProject failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PresetRow[];
}

export async function createPreset(input: CreatePresetInput): Promise<PresetRow> {
  const { projectId, ...body } = input;
  const res = await internalFetch(
    `/internal/projects/${encodeURIComponent(projectId)}/presets`,
    { method: 'POST', body },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createPreset failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PresetRow;
}

export async function updatePreset(id: string, patch: UpdatePresetInput): Promise<PresetRow> {
  const res = await internalFetch(`/internal/presets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`updatePreset failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PresetRow;
}

export async function deletePreset(id: string): Promise<void> {
  const res = await internalFetch(`/internal/presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`deletePreset failed: ${res.status} ${text}`);
  }
}

// Triggers a run from a saved preset. Returns the same shape as createRun so
// the caller can navigate straight to /dashboard/runs/[id].
export async function triggerPresetRun(
  presetId: string,
  triggeredByUserId: string,
  workingDir?: string,
): Promise<RunSummary> {
  const res = await internalFetch(`/internal/runs/from-preset/${encodeURIComponent(presetId)}`, {
    method: 'POST',
    body: { triggeredByUserId, ...(workingDir ? { workingDir } : {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`triggerPresetRun failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunSummary;
}
