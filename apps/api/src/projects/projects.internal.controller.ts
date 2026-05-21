import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { ProjectsService, type CreateProjectInput } from './projects.service';

@Controller('internal/projects')
@UseGuards(InternalAuthGuard)
export class ProjectsInternalController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list(@Query('ownerId') ownerId: string) {
    if (!ownerId) throw new BadRequestException('ownerId query param is required');
    const items = await this.projects.listByOwner(ownerId);
    return items.map((p) => ({
      id: p.id,
      repoFullName: p.repoFullName,
      githubInstallationId: p.githubInstallationId,
      localRoot: p.localRoot,
      createdAt: p.createdAt,
    }));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const detail = await this.projects.getDetail(id);
    const p = detail.project;
    return {
      id: p.id,
      repoFullName: p.repoFullName,
      githubInstallationId: p.githubInstallationId,
      githubRepoId: p.githubRepoId,
      localRoot: p.localRoot,
      worktreePolicy: p.worktreePolicy,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      defaultClient: p.defaultClient,
      defaultHarness: p.defaultHarness,
      runCount: detail.runCount,
      lastRun: detail.lastRun
        ? {
            id: detail.lastRun.id,
            status: detail.lastRun.status,
            startedAt: detail.lastRun.startedAt.toISOString(),
            finishedAt: detail.lastRun.finishedAt?.toISOString() ?? null,
          }
        : null,
      lastEvent: detail.lastEvent
        ? {
            id: detail.lastEvent.id,
            eventType: detail.lastEvent.eventType,
            action: detail.lastEvent.action,
            receivedAt: detail.lastEvent.receivedAt.toISOString(),
          }
        : null,
    };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = parseCreateBody(body);
    const project = await this.projects.createFromGithub(input);
    return {
      id: project.id,
      repoFullName: project.repoFullName,
      githubRepoId: project.githubRepoId,
    };
  }
}

function parseCreateBody(body: unknown): CreateProjectInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.ownerId !== 'string' || !b.ownerId) {
    throw new BadRequestException('ownerId must be a non-empty string');
  }
  if (typeof b.installationId !== 'number') {
    throw new BadRequestException('installationId must be a number');
  }
  if (typeof b.repoFullName !== 'string' || !b.repoFullName.includes('/')) {
    throw new BadRequestException('repoFullName must be a string of form "owner/name"');
  }
  if (typeof b.localRoot !== 'string' || !b.localRoot) {
    throw new BadRequestException('localRoot must be a non-empty string');
  }

  return {
    ownerId: b.ownerId,
    installationId: b.installationId,
    repoFullName: b.repoFullName,
    localRoot: b.localRoot,
  };
}
