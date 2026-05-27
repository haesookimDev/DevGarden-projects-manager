import { internalFetch } from './internal';

export interface HarnessSummary {
  id: string;
  ownerId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function listHarnessesByOwner(
  ownerId: string,
  opts: { latestOnly?: boolean } = {},
): Promise<HarnessSummary[]> {
  const params = new URLSearchParams({ ownerId });
  if (opts.latestOnly === false) params.set('latest', 'false');
  const res = await internalFetch(`/internal/harnesses?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listHarnessesByOwner failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessSummary[];
}

export async function listHarnessVersions(
  ownerId: string,
  name: string,
): Promise<HarnessSummary[]> {
  const params = new URLSearchParams({ ownerId, name });
  const res = await internalFetch(`/internal/harnesses?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listHarnessVersions failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessSummary[];
}

export interface HarnessDetail extends HarnessSummary {
  definition: unknown;
}

export async function getHarness(id: string): Promise<HarnessDetail> {
  const res = await internalFetch(`/internal/harnesses/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getHarness failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessDetail;
}

export interface CreateHarnessInput {
  ownerId: string;
  name: string;
  definition: unknown;
  source?: string;
}

// Every call creates a new version row (api side bumps the version).
// The editor uses this for both "new" and "save" — saving the same name
// twice does not error, it just yields a new version.
export async function createHarness(input: CreateHarnessInput): Promise<HarnessSummary> {
  const res = await internalFetch('/internal/harnesses', { method: 'POST', body: input });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createHarness failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessSummary;
}
