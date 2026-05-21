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
}

function isTerminal(status: RunStatus): boolean {
  return (
    status === RunStatus.SUCCESS || status === RunStatus.FAILED || status === RunStatus.CANCELLED
  );
}
