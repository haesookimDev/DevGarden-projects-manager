import { Injectable, Logger } from '@nestjs/common';
import type { GithubEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordGithubEventInput {
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a webhook delivery to the audit table. Idempotent on `deliveryId`
   * — GitHub may retry deliveries; we keep only the first row.
   */
  async record(input: RecordGithubEventInput): Promise<GithubEvent | null> {
    const repoFullName = extractRepoFullName(input.payload);
    const action = extractAction(input.payload);
    const projectId = repoFullName ? await this.lookupProjectId(repoFullName) : null;

    try {
      return await this.prisma.githubEvent.create({
        data: {
          deliveryId: input.deliveryId,
          eventType: input.eventType,
          action,
          repoFullName,
          projectId,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.debug(`duplicate delivery ${input.deliveryId} ignored`);
        return null;
      }
      throw err;
    }
  }

  private async lookupProjectId(repoFullName: string): Promise<string | null> {
    const row = await this.prisma.project.findFirst({
      where: { repoFullName },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

function extractRepoFullName(payload: Record<string, unknown>): string | null {
  const repo = (payload as { repository?: { full_name?: unknown } }).repository;
  return repo && typeof repo.full_name === 'string' ? repo.full_name : null;
}

function extractAction(payload: Record<string, unknown>): string | null {
  const action = (payload as { action?: unknown }).action;
  return typeof action === 'string' ? action : null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
  );
}
