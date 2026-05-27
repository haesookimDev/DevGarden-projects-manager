import { internalFetch } from './internal';

export interface HarnessSummary {
  id: string;
  ownerId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function listHarnessesByOwner(ownerId: string): Promise<HarnessSummary[]> {
  const res = await internalFetch(`/internal/harnesses?ownerId=${encodeURIComponent(ownerId)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listHarnessesByOwner failed: ${res.status} ${text}`);
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
