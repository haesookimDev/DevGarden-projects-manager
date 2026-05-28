import { internalFetch } from './internal';

export interface CostTrendDay {
  day: string;
  cost: number;
  tokens: number;
  runs: number;
}

export interface CostTrendProject {
  projectId: string;
  repoFullName: string;
  cost: number;
  tokens: number;
  runs: number;
}

export interface CostTrendHarness {
  harnessId: string;
  name: string;
  cost: number;
  tokens: number;
  runs: number;
}

export interface CostTrend {
  days: number;
  since: string;
  daily: CostTrendDay[];
  byProject: CostTrendProject[];
  byHarness: CostTrendHarness[];
  totalCost: number;
  totalTokens: number;
}

export async function getCostTrend(ownerId: string, days = 30): Promise<CostTrend> {
  const params = new URLSearchParams({ ownerId, days: String(days) });
  const res = await internalFetch(`/internal/stats/cost-trend?${params.toString()}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getCostTrend failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CostTrend;
}
