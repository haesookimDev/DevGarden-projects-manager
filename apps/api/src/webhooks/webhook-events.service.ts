import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { GithubEvent } from '@prisma/client';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ListEventsInput {
  projectId?: string;
  eventType?: string;
  since?: Date;
  pageSize?: number;
}

export interface WebhookEventRow {
  id: string;
  deliveryId: string;
  eventType: string;
  action: string | null;
  repoFullName: string | null;
  projectId: string | null;
  receivedAt: string;
}

export type RedeliverResult =
  | { ok: true; deliveryId: number }
  | { ok: false; reason: 'not-found-on-github' | 'no-app-credentials'; message: string };

// Minimal octokit shape this service needs — listing the App's webhook
// deliveries + redelivering one. Declared structurally so the real Octokit
// satisfies it and tests can pass a tiny fake.
export interface WebhookOctokit {
  apps: {
    listWebhookDeliveries(params: {
      per_page?: number;
    }): Promise<{ data: Array<{ id: number; guid: string }> }>;
    redeliverWebhookDelivery(params: { delivery_id: number }): Promise<unknown>;
  };
}

@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly githubApp: GithubAppService,
  ) {}

  // Audit listing for /dashboard/webhooks. Lightweight — no payload (fetch
  // that per-event via getEvent for the JSON preview).
  async listEvents(input: ListEventsInput): Promise<WebhookEventRow[]> {
    const pageSize = clamp(input.pageSize ?? 50, 1, 200);
    const rows = await this.prisma.githubEvent.findMany({
      where: {
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
        ...(input.since ? { receivedAt: { gte: input.since } } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: pageSize,
    });
    return rows.map(toRow);
  }

  async getEvent(id: string): Promise<GithubEvent> {
    const row = await this.prisma.githubEvent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`github event ${id} not found`);
    return row;
  }

  // Redeliver the App-level webhook delivery that produced this event.
  //
  // We store the X-GitHub-Delivery GUID; GitHub's redelivery API keys on a
  // numeric delivery id, so we list the App's recent deliveries and match by
  // guid. `octokitOverride` is a test seam — production resolves the App
  // octokit from GithubAppService.
  async redeliver(eventId: string, octokitOverride?: WebhookOctokit): Promise<RedeliverResult> {
    const event = await this.getEvent(eventId);

    let octokit: WebhookOctokit;
    try {
      octokit = octokitOverride ?? (this.githubApp.appOctokit() as unknown as WebhookOctokit);
    } catch (err) {
      return {
        ok: false,
        reason: 'no-app-credentials',
        message: err instanceof Error ? err.message : 'app octokit unavailable',
      };
    }

    const { data } = await octokit.apps.listWebhookDeliveries({ per_page: 100 });
    const match = data.find((d) => d.guid === event.deliveryId);
    if (!match) {
      return {
        ok: false,
        reason: 'not-found-on-github',
        message: `delivery ${event.deliveryId} not found in the App's recent deliveries`,
      };
    }

    await octokit.apps.redeliverWebhookDelivery({ delivery_id: match.id });
    this.logger.log(`redelivered webhook ${event.deliveryId} (delivery_id=${match.id})`);
    return { ok: true, deliveryId: match.id };
  }
}

function toRow(e: GithubEvent): WebhookEventRow {
  return {
    id: e.id,
    deliveryId: e.deliveryId,
    eventType: e.eventType,
    action: e.action,
    repoFullName: e.repoFullName,
    projectId: e.projectId,
    receivedAt: e.receivedAt.toISOString(),
  };
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
