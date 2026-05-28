import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RunStatus } from '@prisma/client';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { PresetsService } from '../projects/presets.service';
import { RunsGateway } from './runs.gateway';
import { RunsService } from './runs.service';

@Controller('internal/runs')
@UseGuards(InternalAuthGuard)
export class RunsInternalController {
  private readonly logger = new Logger(RunsInternalController.name);

  constructor(
    private readonly runs: RunsService,
    private readonly gateway: RunsGateway,
    private readonly presets: PresetsService,
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
  async list(
    @Query('projectId') projectId: string | undefined,
    @Query('ownerId') ownerId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('status') status: string | undefined,
  ) {
    if (projectId) {
      const items = await this.runs.listByProject(projectId);
      return items.map(projectRun);
    }
    if (ownerId) {
      const parsedLimit = limit ? Number(limit) : undefined;
      const parsedStatus = parseRunStatus(status);
      const items = await this.runs.listByOwner(ownerId, {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        status: parsedStatus,
      });
      return items.map((r) => ({
        ...projectRun(r),
        repoFullName: r.project.repoFullName,
      }));
    }
    throw new BadRequestException('projectId or ownerId query is required');
  }

  @Get('stats')
  async stats(
    @Query('ownerId') ownerId: string | undefined,
    @Query('sinceHours') sinceHours: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    const parsed = sinceHours ? Number(sinceHours) : undefined;
    return this.runs.statsByOwner(ownerId, {
      sinceHours: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  // Filtered + paginated search over an owner's runs. Powers the
  // /dashboard/runs filter sidebar (N6). All filters optional, ANDed.
  // NOTE: registered before @Get(':id') so "search" isn't swallowed as an id.
  @Get('search')
  async search(
    @Query('ownerId') ownerId: string | undefined,
    @Query('projectId') projectId: string | undefined,
    @Query('harnessId') harnessId: string | undefined,
    @Query('clientId') clientId: string | undefined,
    @Query('triggeredByUserId') triggeredByUserId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('since') since: string | undefined,
    @Query('until') until: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    const result = await this.runs.searchByOwner({
      ownerId,
      ...(projectId ? { projectId } : {}),
      ...(harnessId ? { harnessId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(triggeredByUserId ? { triggeredByUserId } : {}),
      ...(status ? { status: parseRunStatus(status)! } : {}),
      ...(since ? { since: parseDate(since, 'since') } : {}),
      ...(until ? { until: parseDate(until, 'until') } : {}),
      ...(q ? { q } : {}),
      ...(page ? { page: parsePositiveInt(page, 'page') } : {}),
      ...(pageSize ? { pageSize: parsePositiveInt(pageSize, 'pageSize') } : {}),
    });
    return {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      items: result.items.map((r) => ({
        ...projectRun(r),
        repoFullName: r.project.repoFullName,
        harnessName: r.harness.name,
        harnessVersion: r.harness.version,
      })),
    };
  }

  // Trigger a run from a saved RunPreset. The preset supplies harness +
  // client + inputs; the caller supplies `triggeredByUserId` (BFF maps
  // session → user). Returns the same shape as POST /internal/runs so the
  // web BFF can reuse its existing run-detail link.
  @Post('from-preset/:presetId')
  async createFromPreset(@Param('presetId') presetId: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const triggeredByUserId = requireString(b, 'triggeredByUserId');
    const workingDir = typeof b.workingDir === 'string' ? b.workingDir : undefined;

    let preset;
    try {
      preset = await this.presets.getById(presetId);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw err;
    }

    const run = await this.runs.createRun({
      harnessId: preset.harnessId,
      projectId: preset.projectId,
      clientId: preset.clientId,
      triggeredByUserId,
      workingDir,
    });

    try {
      const harness = await this.runs.getHarnessDefinition(preset.harnessId);
      this.gateway.emitRunStart(preset.clientId, {
        runId: run.id,
        harness,
        inputs: (preset.inputs ?? {}) as Record<string, unknown>,
        workingDir,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`preset run ${run.id} dispatch failed: ${msg}`);
    }

    return projectRun(run);
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

function parseRunStatus(s: string | undefined): RunStatus | undefined {
  if (!s) return undefined;
  if (s in RunStatus) return RunStatus[s as keyof typeof RunStatus];
  throw new BadRequestException(`invalid status "${s}"`);
}

function parseDate(s: string, key: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${key} must be an ISO date string`);
  }
  return d;
}

function parsePositiveInt(s: string, key: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`${key} must be a positive integer`);
  }
  return n;
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
