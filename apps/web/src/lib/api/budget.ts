import { internalFetch } from './internal';

export interface BudgetView {
  ownerId: string;
  monthlyUsdLimit: number | null;
  warnAt: number;
  resetDay: number;
  updatedAt: string | null;
}

export interface BudgetStatus {
  threshold: 'ok' | 'warn' | 'exceeded';
  spendUsd: number;
  limitUsd: number | null;
  warnAt: number;
  since: string;
}

export interface UpdateBudgetInput {
  monthlyUsdLimit?: number | null;
  warnAt?: number;
  resetDay?: number;
}

export async function getBudget(ownerId: string): Promise<BudgetView> {
  const res = await internalFetch(`/internal/owner-budget/${encodeURIComponent(ownerId)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getBudget failed: ${res.status} ${text}`);
  }
  return (await res.json()) as BudgetView;
}

export async function getBudgetStatus(ownerId: string): Promise<BudgetStatus> {
  const res = await internalFetch(`/internal/owner-budget/${encodeURIComponent(ownerId)}/status`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getBudgetStatus failed: ${res.status} ${text}`);
  }
  return (await res.json()) as BudgetStatus;
}

export async function updateBudget(ownerId: string, patch: UpdateBudgetInput): Promise<BudgetView> {
  const res = await internalFetch(`/internal/owner-budget/${encodeURIComponent(ownerId)}`, {
    method: 'PUT',
    body: patch,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`updateBudget failed: ${res.status} ${text}`);
  }
  return (await res.json()) as BudgetView;
}
