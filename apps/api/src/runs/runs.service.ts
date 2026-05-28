import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type HarnessRun,
  type Prisma,
  type RunLog,
  type RunStep,
  RunStatus,
  StepKind,
  StepStatus,
  LogLevel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateRunInput {
  harnessId: string;
  projectId: string;
  clientId: string;
  triggeredByUserId: string;
  branchName?: string;
  workingDir?: string;
}

export interface AppendStepInput {
  runId: string;
  stepIndex: number;
  stepId: string;
  kind: StepKind;
  input?: unknown;
  output?: unknown;
  status: StepStatus;
  durationMs?: number;
  error?: string;
}

export interface AppendLogInput {
  runId: string;
  level: LogLevel;
  source: string;
  message: string;
}

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: CreateRunInput): Promise<HarnessRun> {
    return this.prisma.harnessRun.create({
      data: {
        harnessId: input.harnessId,
        projectId: input.projectId,
        clientId: input.clientId,
        triggeredByUserId: input.triggeredByUserId,
        branchName: input.branchName,
        workingDir: input.workingDir,
        status: RunStatus.QUEUED,
      },
    });
  }

  async getHarnessDefinition(harnessId: string): Promise<unknown> {
    const row = await this.prisma.harness.findUnique({
      where: { id: harnessId },
      select: { definition: true },
    });
    if (!row) throw new NotFoundException(`harness ${harnessId} not found`);
    return row.definition;
  }

  async setStatus(runId: string, status: RunStatus, finishedAt?: Date): Promise<HarnessRun> {
    return this.prisma.harnessRun.update({
      where: { id: runId },
      data: { status, finishedAt: finishedAt ?? (isTerminal(status) ? new Date() : null) },
    });
  }

  async appendStep(input: AppendStepInput): Promise<RunStep> {
    return this.prisma.runStep.create({
      data: {
        runId: input.runId,
        stepIndex: input.stepIndex,
        stepId: input.stepId,
        kind: input.kind,
        input: input.input as Prisma.InputJsonValue | undefined,
        output: input.output as Prisma.InputJsonValue | undefined,
        status: input.status,
        durationMs: input.durationMs,
        error: input.error,
      },
    });
  }

  appendLog(input: AppendLogInput): Promise<RunLog> {
    return this.prisma.runLog.create({
      data: {
        runId: input.runId,
        level: input.level,
        source: input.source,
        message: input.message,
      },
    });
  }

  async getRun(runId: string): Promise<HarnessRun & { steps: RunStep[]; logs: RunLog[] }> {
    const run = await this.prisma.harnessRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { stepIndex: 'asc' } },
        logs: { orderBy: { ts: 'asc' }, take: 500 },
      },
    });
    if (!run) throw new NotFoundException(`run ${runId} not found`);
    return run;
  }

  listByProject(projectId: string): Promise<HarnessRun[]> {
    return this.prisma.harnessRun.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  listByOwner(
    ownerId: string,
    opts: { limit?: number; status?: RunStatus } = {},
  ): Promise<Array<HarnessRun & { project: { id: string; repoFullName: string } }>> {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    return this.prisma.harnessRun.findMany({
      where: {
        project: { ownerId },
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { project: { select: { id: true, repoFullName: true } } },
    });
  }

  /**
   * Paginated, filtered search over an owner's runs. Every filter is
   * optional and ANDed together; the result carries the page slice plus the
   * total match count so the UI can render "X–Y of N" + pagination. The
   * search powers /dashboard/runs's filter sidebar (N6).
   */
  async searchByOwner(input: RunSearchInput): Promise<RunSearchResult> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = clamp(input.pageSize ?? 25, 1, 100);

    const where: Prisma.HarnessRunWhereInput = {
      project: { ownerId: input.ownerId },
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.harnessId ? { harnessId: input.harnessId } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.triggeredByUserId ? { triggeredByUserId: input.triggeredByUserId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.since || input.until
        ? {
            startedAt: {
              ...(input.since ? { gte: input.since } : {}),
              ...(input.until ? { lte: input.until } : {}),
            },
          }
        : {}),
      // Free-text `q` matches the run id prefix or the branch name. Run ids
      // are cuids so a prefix match is the common "I have a partial id" case.
      ...(input.q
        ? {
            OR: [
              { id: { startsWith: input.q } },
              { branchName: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.harnessRun.count({ where }),
      this.prisma.harnessRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, repoFullName: true } },
          harness: { select: { id: true, name: true, version: true } },
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  /**
   * Aggregate stats for an owner's runs, optionally bounded to `sinceHours`
   * back. Cost is summed from the `costUsd` column (Decimal → string at the
   * Prisma layer, converted to number here for transport).
   */
  async statsByOwner(ownerId: string, opts: { sinceHours?: number } = {}): Promise<OwnerRunStats> {
    const sinceHours = clamp(opts.sinceHours ?? 24 * 7, 1, 24 * 90);
    const since = new Date(Date.now() - sinceHours * 3_600_000);

    const where = { project: { ownerId }, startedAt: { gte: since } };

    const [byStatus, totals] = await Promise.all([
      this.prisma.harnessRun.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.harnessRun.aggregate({
        where: { ...where, status: { in: [RunStatus.SUCCESS, RunStatus.FAILED] } },
        _avg: { costUsd: true },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of byStatus) {
      counts[row.status] = row._count._all;
      total += row._count._all;
    }

    return {
      sinceHours,
      total,
      counts,
      successRate:
        (counts[RunStatus.SUCCESS] ?? 0) + (counts[RunStatus.FAILED] ?? 0) === 0
          ? null
          : (counts[RunStatus.SUCCESS] ?? 0) /
            ((counts[RunStatus.SUCCESS] ?? 0) + (counts[RunStatus.FAILED] ?? 0)),
      totalCostUsd: totals._sum.costUsd ? Number(totals._sum.costUsd) : 0,
      avgCostUsd: totals._avg.costUsd ? Number(totals._avg.costUsd) : null,
      terminalCount: totals._count._all,
    };
  }
}

export interface OwnerRunStats {
  sinceHours: number;
  total: number;
  counts: Record<string, number>;
  successRate: number | null;
  totalCostUsd: number;
  avgCostUsd: number | null;
  terminalCount: number;
}

export interface RunSearchInput {
  ownerId: string;
  projectId?: string;
  harnessId?: string;
  clientId?: string;
  triggeredByUserId?: string;
  status?: RunStatus;
  since?: Date;
  until?: Date;
  /** Free-text: run id prefix or branch name substring. */
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface RunSearchResult {
  page: number;
  pageSize: number;
  total: number;
  items: Array<
    HarnessRun & {
      project: { id: string; repoFullName: string };
      harness: { id: string; name: string; version: number };
    }
  >;
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function isTerminal(status: RunStatus): boolean {
  return (
    status === RunStatus.SUCCESS || status === RunStatus.FAILED || status === RunStatus.CANCELLED
  );
}
