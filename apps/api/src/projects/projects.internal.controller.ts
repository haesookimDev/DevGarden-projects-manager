import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
