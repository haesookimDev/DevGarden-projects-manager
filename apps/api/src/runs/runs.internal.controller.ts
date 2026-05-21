import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { RunsGateway } from './runs.gateway';
import { RunsService } from './runs.service';

@Controller('internal/runs')
@UseGuards(InternalAuthGuard)
export class RunsInternalController {
  private readonly logger = new Logger(RunsInternalController.name);

  constructor(
    private readonly runs: RunsService,
    private readonly gateway: RunsGateway,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const harnessId = requireString(b, 'harnessId');
    const projectId = requireString(b, 'projectId');
    const clientId = requireString(b, 'clientId');
    const triggeredByUserId = requireString(b, 'triggeredByUserId');
    const branchName = typeof b.branchName === 'string' ? b.branchName : undefined;
    const workingDir = typeof b.workingDir === 'string' ? b.workingDir : undefined;
    const inputs =
      b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs)
        ? (b.inputs as Record<string, unknown>)
        : {};

    const run = await this.runs.createRun({
      harnessId,
      projectId,
      clientId,
      triggeredByUserId,
      branchName,
      workingDir,
    });

    try {
      const harness = await this.runs.getHarnessDefinition(harnessId);
      this.gateway.emitRunStart(clientId, {
        runId: run.id,
        harness,
        inputs,
        workingDir,
      });
    } catch (err) {
      // Dispatch failure shouldn't roll back the queued run — surface it in
      // logs so an operator can investigate and the client can be retried.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`run ${run.id} dispatch failed: ${msg}`);
    }

    return projectRun(run);
  }

  @Get()
  async list(@Query('projectId') projectId: string) {
    if (!projectId) throw new BadRequestException('projectId query is required');
    const items = await this.runs.listByProject(projectId);
    return items.map(projectRun);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const run = await this.runs.getRun(id);
    return {
      ...projectRun(run),
      steps: run.steps.map((s) => ({
        id: s.id,
        stepIndex: s.stepIndex,
        stepId: s.stepId,
        kind: s.kind,
        status: s.status,
        durationMs: s.durationMs,
        error: s.error,
        createdAt: s.createdAt.toISOString(),
      })),
      logs: run.logs.map((l) => ({
        id: l.id,
        ts: l.ts.toISOString(),
        level: l.level,
        source: l.source,
        message: l.message,
      })),
    };
  }
}

function requireString(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string' || !v) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return v;
}

interface RunRow {
  id: string;
  harnessId: string;
  projectId: string;
  clientId: string;
  triggeredByUserId: string;
  status: string;
  branchName: string | null;
  workingDir: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

function projectRun(run: RunRow) {
  return {
    id: run.id,
    harnessId: run.harnessId,
    projectId: run.projectId,
    clientId: run.clientId,
    triggeredByUserId: run.triggeredByUserId,
    status: run.status,
    branchName: run.branchName,
    workingDir: run.workingDir,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  };
}
