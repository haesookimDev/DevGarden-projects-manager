import { internalFetch } from './internal';

export interface TriggerMap {
  success: boolean;
  failed: boolean;
  cancelled: boolean;
}

export interface NotificationSettings {
  userId: string;
  webToast: boolean;
  slackConfigured: boolean;
  slackHint: string | null;
  emailEnabled: boolean;
  emailAddress: string | null;
  triggers: TriggerMap;
  perProject: Record<string, Partial<TriggerMap>>;
  updatedAt: string | null;
}

export interface UpdateNotificationSettingsInput {
  webToast?: boolean;
  slackWebhookUrl?: string | null;
  emailEnabled?: boolean;
  emailAddress?: string | null;
  triggers?: Partial<TriggerMap>;
  perProject?: Record<string, Partial<TriggerMap>>;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  runId: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const res = await internalFetch(
    `/internal/users/${encodeURIComponent(userId)}/notification-settings`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getNotificationSettings failed: ${res.status} ${text}`);
  }
  return (await res.json()) as NotificationSettings;
}

export async function updateNotificationSettings(
  userId: string,
  patch: UpdateNotificationSettingsInput,
): Promise<NotificationSettings> {
  const res = await internalFetch(
    `/internal/users/${encodeURIComponent(userId)}/notification-settings`,
    { method: 'PUT', body: patch },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`updateNotificationSettings failed: ${res.status} ${text}`);
  }
  return (await res.json()) as NotificationSettings;
}

export async function sendTestNotification(userId: string): Promise<NotificationItem> {
  const res = await internalFetch(
    `/internal/users/${encodeURIComponent(userId)}/notifications/test`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sendTestNotification failed: ${res.status} ${text}`);
  }
  return (await res.json()) as NotificationItem;
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationItem[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.unreadOnly) params.set('unreadOnly', '1');
  const qs = params.toString();
  const res = await internalFetch(
    `/internal/users/${encodeURIComponent(userId)}/notifications${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listNotifications failed: ${res.status} ${text}`);
  }
  return (await res.json()) as NotificationItem[];
}
