import { internalFetch } from './internal';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface RunSummary {
  id: string;
  harnessId: string;
  projectId: string;
  clientId: string;
  triggeredByUserId: string;
  status: RunStatus;
  branchName: string | null;
  workingDir: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RunStepRow {
  id: string;
  stepIndex: number;
  stepId: string;
  kind: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface RunLogRow {
  id: string;
  ts: string;
  level: string;
  source: string;
  message: string;
}

export interface RunDetail extends RunSummary {
  steps: RunStepRow[];
  logs: RunLogRow[];
}

export async function getRun(id: string): Promise<RunDetail> {
  const res = await internalFetch(`/internal/runs/${encodeURIComponent(id)}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getRun failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunDetail;
}

export async function listRunsByProject(projectId: string): Promise<RunSummary[]> {
  const res = await internalFetch(`/internal/runs?projectId=${encodeURIComponent(projectId)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listRunsByProject failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunSummary[];
}

export interface CreateRunInput {
  harnessId: string;
  projectId: string;
  clientId: string;
  triggeredByUserId: string;
  branchName?: string;
  workingDir?: string;
  inputs?: Record<string, unknown>;
}

export async function createRun(input: CreateRunInput): Promise<RunSummary> {
  const res = await internalFetch('/internal/runs', { method: 'POST', body: input });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createRun failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunSummary;
}

export interface RunHistoryRow extends RunSummary {
  repoFullName: string;
}

export async function listRunsByOwner(
  ownerId: string,
  opts: { limit?: number; status?: RunStatus } = {},
): Promise<RunHistoryRow[]> {
  const params = new URLSearchParams({ ownerId });
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.status) params.set('status', opts.status);
  const res = await internalFetch(`/internal/runs?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listRunsByOwner failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunHistoryRow[];
}

export interface RunsStats {
  sinceHours: number;
  total: number;
  counts: Record<string, number>;
  successRate: number | null;
  totalCostUsd: number;
  avgCostUsd: number | null;
  terminalCount: number;
}

export async function getRunsStats(
  ownerId: string,
  opts: { sinceHours?: number } = {},
): Promise<RunsStats> {
  const params = new URLSearchParams({ ownerId });
  if (opts.sinceHours) params.set('sinceHours', String(opts.sinceHours));
  const res = await internalFetch(`/internal/runs/stats?${params.toString()}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getRunsStats failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunsStats;
}
