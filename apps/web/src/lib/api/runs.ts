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
