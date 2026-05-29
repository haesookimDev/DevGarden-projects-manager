import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Which terminal run statuses notify. Defaults: only failures, to avoid spam.
export interface TriggerMap {
  success: boolean;
  failed: boolean;
  cancelled: boolean;
}

const DEFAULT_TRIGGERS: TriggerMap = { success: false, failed: true, cancelled: false };

type TriggerKey = keyof TriggerMap;
const STATUS_TO_TRIGGER: Record<'SUCCESS' | 'FAILED' | 'CANCELLED', TriggerKey> = {
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export interface NotificationSettingsView {
  userId: string;
  webToast: boolean;
  /** Whether a Slack webhook URL is stored (the URL itself is never returned). */
  slackConfigured: boolean;
  emailEnabled: boolean;
  emailAddress: string | null;
  triggers: TriggerMap;
  perProject: Record<string, Partial<TriggerMap>>;
  updatedAt: string | null;
}

export interface UpdateNotificationSettingsInput {
  webToast?: boolean;
  emailEnabled?: boolean;
  emailAddress?: string | null;
  triggers?: Partial<TriggerMap>;
  perProject?: Record<string, Partial<TriggerMap>>;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  runId: string | null;
  readAt: string | null;
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<NotificationSettingsView> {
    const row = await this.prisma.userNotificationSettings.findUnique({ where: { userId } });
    return toView(userId, row);
  }

  async upsertSettings(
    userId: string,
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettingsView> {
    if (
      input.emailAddress != null &&
      input.emailAddress !== '' &&
      !EMAIL_RE.test(input.emailAddress)
    ) {
      throw new BadRequestException('emailAddress is not a valid email');
    }

    const existing = await this.prisma.userNotificationSettings.findUnique({ where: { userId } });
    const currentTriggers = parseTriggers(existing?.triggers);
    const mergedTriggers: TriggerMap = { ...currentTriggers, ...sanitizeTriggers(input.triggers) };
    const mergedPerProject =
      input.perProject !== undefined
        ? sanitizePerProject(input.perProject)
        : parsePerProject(existing?.perProject);

    const data = {
      ...(input.webToast !== undefined ? { webToast: input.webToast } : {}),
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.emailAddress !== undefined ? { emailAddress: input.emailAddress || null } : {}),
      triggers: mergedTriggers as unknown as Prisma.InputJsonValue,
      perProject: mergedPerProject as unknown as Prisma.InputJsonValue,
    };

    const row = await this.prisma.userNotificationSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return toView(userId, row);
  }

  /**
   * Fan a terminal run status out to the owner's enabled channels (N5). Reads
   * the owner's settings, honors the per-project trigger override, then
   * delivers. Only the web-toast channel exists in this PR; Slack/email plug
   * in later. Never throws — notification delivery must not break the run
   * lifecycle.
   */
  async fanOut(input: {
    runId: string;
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  }): Promise<void> {
    try {
      const run = await this.prisma.harnessRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          projectId: true,
          project: { select: { ownerId: true, repoFullName: true } },
        },
      });
      if (!run) return;

      const ownerId = run.project.ownerId;
      const settings = await this.prisma.userNotificationSettings.findUnique({
        where: { userId: ownerId },
      });
      const key = STATUS_TO_TRIGGER[input.status];
      if (!this.triggerEnabled(settings, run.projectId, key)) return;

      if (settings?.webToast ?? DEFAULT_WEB_TOAST) {
        const shortId = run.id.slice(0, 8);
        await this.deliverWebToast(ownerId, {
          kind: `run-${key}`,
          title: RUN_TITLES[key],
          body: `${run.project.repoFullName} · ${shortId}`,
          runId: run.id,
        });
      }
    } catch (err) {
      this.logger.error(
        `notification fanOut failed for run ${input.runId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * BudgetNotifier seam (bound to BUDGET_NOTIFIER in BudgetModule). Turns a
   * budget warn/exceeded crossing into a web-toast notification.
   */
  async notify(event: {
    ownerId: string;
    kind: 'budget-warn' | 'budget-exceeded';
    status: { spendUsd: number; limitUsd: number | null; warnAt: number };
  }): Promise<void> {
    try {
      const settings = await this.prisma.userNotificationSettings.findUnique({
        where: { userId: event.ownerId },
      });
      if (!(settings?.webToast ?? DEFAULT_WEB_TOAST)) return;

      const limit = event.status.limitUsd != null ? `$${event.status.limitUsd.toFixed(2)}` : '—';
      await this.deliverWebToast(event.ownerId, {
        kind: event.kind,
        title: event.kind === 'budget-exceeded' ? 'Budget exceeded' : 'Budget warning',
        body: `$${event.status.spendUsd.toFixed(2)} / ${limit} (${event.status.warnAt}% threshold)`,
      });
    } catch (err) {
      this.logger.error(
        `budget notification failed for owner ${event.ownerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async sendTest(userId: string): Promise<NotificationView> {
    const row = await this.deliverWebToast(userId, {
      kind: 'test',
      title: 'Test notification',
      body: 'If you can see this, web toast notifications are working.',
    });
    return toNotificationView(row);
  }

  async listNotifications(
    userId: string,
    opts: { limit?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationView[]> {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toNotificationView);
  }

  private async deliverWebToast(
    userId: string,
    n: { kind: string; title: string; body?: string; runId?: string },
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: { userId, kind: n.kind, title: n.title, body: n.body ?? null, runId: n.runId ?? null },
    });
  }

  private triggerEnabled(
    settings: { triggers: Prisma.JsonValue; perProject: Prisma.JsonValue } | null,
    projectId: string,
    key: TriggerKey,
  ): boolean {
    const perProject = parsePerProject(settings?.perProject);
    const override = perProject[projectId]?.[key];
    if (typeof override === 'boolean') return override;
    return parseTriggers(settings?.triggers)[key];
  }
}

const DEFAULT_WEB_TOAST = true;

const RUN_TITLES: Record<TriggerKey, string> = {
  success: 'Run succeeded',
  failed: 'Run failed',
  cancelled: 'Run cancelled',
};

function parseTriggers(value: Prisma.JsonValue | undefined | null): TriggerMap {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    return {
      success: typeof v.success === 'boolean' ? v.success : DEFAULT_TRIGGERS.success,
      failed: typeof v.failed === 'boolean' ? v.failed : DEFAULT_TRIGGERS.failed,
      cancelled: typeof v.cancelled === 'boolean' ? v.cancelled : DEFAULT_TRIGGERS.cancelled,
    };
  }
  return { ...DEFAULT_TRIGGERS };
}

function sanitizeTriggers(input: Partial<TriggerMap> | undefined): Partial<TriggerMap> {
  if (!input) return {};
  const out: Partial<TriggerMap> = {};
  for (const k of ['success', 'failed', 'cancelled'] as const) {
    if (typeof input[k] === 'boolean') out[k] = input[k];
  }
  return out;
}

function parsePerProject(
  value: Prisma.JsonValue | undefined | null,
): Record<string, Partial<TriggerMap>> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Partial<TriggerMap>>;
  }
  return {};
}

function sanitizePerProject(
  input: Record<string, Partial<TriggerMap>>,
): Record<string, Partial<TriggerMap>> {
  const out: Record<string, Partial<TriggerMap>> = {};
  for (const [projectId, overrides] of Object.entries(input)) {
    if (overrides && typeof overrides === 'object') {
      const sane = sanitizeTriggers(overrides);
      if (Object.keys(sane).length > 0) out[projectId] = sane;
    }
  }
  return out;
}

function toView(
  userId: string,
  row: {
    webToast: boolean;
    slackWebhookUrl: Uint8Array | null;
    emailEnabled: boolean;
    emailAddress: string | null;
    triggers: Prisma.JsonValue;
    perProject: Prisma.JsonValue;
    updatedAt: Date;
  } | null,
): NotificationSettingsView {
  return {
    userId,
    webToast: row?.webToast ?? DEFAULT_WEB_TOAST,
    slackConfigured: !!row?.slackWebhookUrl,
    emailEnabled: row?.emailEnabled ?? false,
    emailAddress: row?.emailAddress ?? null,
    triggers: parseTriggers(row?.triggers),
    perProject: parsePerProject(row?.perProject),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function toNotificationView(row: Notification): NotificationView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    runId: row.runId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
