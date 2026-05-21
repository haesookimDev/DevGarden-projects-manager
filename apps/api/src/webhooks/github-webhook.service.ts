import { Injectable, Logger } from '@nestjs/common';
import { type GithubEvent, type Prisma, TodoSource, TodoStatus } from '@prisma/client';
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

    let row: GithubEvent;
    try {
      row = await this.prisma.githubEvent.create({
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

    // Side-effect: keep TodoItem in sync for issues events. Other event types
    // (push / pull_request / etc.) only land in the audit table for now.
    if (input.eventType === 'issues' && projectId) {
      await this.upsertIssueTodo(projectId, input.payload, action);
    }

    return row;
  }

  private async upsertIssueTodo(
    projectId: string,
    payload: Record<string, unknown>,
    action: string | null,
  ): Promise<void> {
    const issue = (payload as { issue?: Record<string, unknown> }).issue;
    if (!issue) return;
    const number = typeof issue.number === 'number' ? issue.number : null;
    const title = typeof issue.title === 'string' ? issue.title : null;
    if (number === null || title === null) return;
    const body = typeof issue.body === 'string' ? issue.body : null;
    const status = mapIssueStateToTodoStatus(issue.state, action);

    try {
      await this.prisma.todoItem.upsert({
        where: {
          projectId_sourceType_sourceRef: {
            projectId,
            sourceType: TodoSource.GITHUB_ISSUE,
            sourceRef: number,
          },
        },
        create: {
          projectId,
          title,
          body,
          status,
          sourceType: TodoSource.GITHUB_ISSUE,
          sourceRef: number,
        },
        update: { title, body, status },
      });
    } catch (err) {
      this.logger.warn(`upsertIssueTodo failed for issue #${number}: ${(err as Error).message}`);
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

function mapIssueStateToTodoStatus(state: unknown, action: string | null): TodoStatus {
  if (state === 'closed' || action === 'closed') return TodoStatus.DONE;
  return TodoStatus.OPEN;
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
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
