import { internalFetch } from './internal';

export interface WebhookEventRow {
  id: string;
  deliveryId: string;
  eventType: string;
  action: string | null;
  repoFullName: string | null;
  projectId: string | null;
  receivedAt: string;
}

export interface WebhookEventDetail extends WebhookEventRow {
  payload: unknown;
}

export type RedeliverResult =
  | { ok: true; deliveryId: number }
  | { ok: false; reason: 'not-found-on-github' | 'no-app-credentials'; message: string };

export interface ListWebhookEventsFilters {
  projectId?: string;
  type?: string;
  since?: string;
  pageSize?: number;
}

export async function listWebhookEvents(
  filters: ListWebhookEventsFilters = {},
): Promise<WebhookEventRow[]> {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.type) params.set('type', filters.type);
  if (filters.since) params.set('since', filters.since);
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  const res = await internalFetch(`/internal/github/events${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listWebhookEvents failed: ${res.status} ${text}`);
  }
  return (await res.json()) as WebhookEventRow[];
}

export async function getWebhookEvent(id: string): Promise<WebhookEventDetail> {
  const res = await internalFetch(`/internal/github/events/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getWebhookEvent failed: ${res.status} ${text}`);
  }
  return (await res.json()) as WebhookEventDetail;
}

export async function redeliverWebhookEvent(id: string): Promise<RedeliverResult> {
  const res = await internalFetch(`/internal/github/events/${encodeURIComponent(id)}/redeliver`, {
    method: 'POST',
    body: {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`redeliverWebhookEvent failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RedeliverResult;
}
