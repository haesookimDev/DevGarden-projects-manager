import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { ClientsGateway } from '../clients/clients.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService, type CreateProjectInput } from './projects.service';

@Controller('internal/projects')
@UseGuards(InternalAuthGuard)
export class ProjectsInternalController {
  private readonly logger = new Logger(ProjectsInternalController.name);

  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
    private readonly clientsGateway: ClientsGateway,
  ) {}

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
      cloneStatus: p.cloneStatus,
      cloneError: p.cloneError,
      cloneCompletedAt: p.cloneCompletedAt?.toISOString() ?? null,
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

  // Web BFF → api: kick off a clone on the paired client. The api flips the
  // project's cloneStatus to CLONING and broadcasts client:cloneProject to
  // the matching `client:<id>` socket room. The sidecar's IPC handler
  // (apps/client-runner/src/clone.ts) takes it from there and reports back
  // via /internal/projects/:id/clone-status.
  @Post(':id/clone')
  async dispatchClone(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.clientId !== 'string' || !b.clientId) {
      throw new BadRequestException('clientId must be a non-empty string');
    }
    if (typeof b.targetPath !== 'string' || !b.targetPath) {
      throw new BadRequestException('targetPath must be a non-empty string');
    }
    const useWorktrees = b.useWorktrees === true;

    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        repoFullName: true,
        githubInstallationId: true,
      },
    });
    if (!project) throw new NotFoundException(`project ${id} not found`);

    const client = await this.prisma.client.findUnique({
      where: { id: b.clientId },
      select: { id: true, ownerId: true },
    });
    if (!client) throw new NotFoundException(`client ${b.clientId} not found`);
    if (client.ownerId !== project.ownerId) {
      throw new ForbiddenException('client does not belong to the project owner');
    }

    // Update Project.localRoot so future status reads + run dispatches use
    // the operator's chosen path. The state-machine guard handles the
    // NOT_CLONED → CLONING (or READY → CLONING for re-clone) transition.
    await this.prisma.project.update({
      where: { id },
      data: { localRoot: b.targetPath },
    });
    await this.projects.updateCloneStatus(id, { status: 'CLONING' });

    this.clientsGateway.emitCloneStart(client.id, {
      projectId: project.id,
      installationId: project.githubInstallationId,
      repoFullName: project.repoFullName,
      targetPath: b.targetPath,
      useWorktrees,
    });
    this.logger.log(`dispatched clone for project ${id} to client ${client.id}`);
    return { ok: true };
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

  const installationDbId =
    typeof b.installationDbId === 'string' && b.installationDbId.length > 0
      ? b.installationDbId
      : undefined;

  return {
    ownerId: b.ownerId,
    installationId: b.installationId,
    repoFullName: b.repoFullName,
    localRoot: b.localRoot,
    ...(installationDbId ? { installationDbId } : {}),
  };
}
