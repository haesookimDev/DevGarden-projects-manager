import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard, type RequestWithClient } from '../auth/client-jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService, type CloneStatusUpdate } from './projects.service';

/**
 * Sidecar-facing project endpoints. Authenticated with the same pairing
 * JWT the sidecar uses for socket.io — see ClientJwtAuthGuard.
 */
@Controller('internal/projects')
@UseGuards(ClientJwtAuthGuard)
export class ProjectsSidecarController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  // The sidecar calls this 1+ times during a clone:
  //   CLONING (when it starts) → READY (on success) | FAILED (on error).
  // The state machine in ProjectsService.updateCloneStatus rejects
  // illegal transitions so a late or duplicate report can't corrupt state.
  @Post(':id/clone-status')
  async updateCloneStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: RequestWithClient,
  ): Promise<{ ok: true }> {
    if (!req.client) throw new ForbiddenException('client context missing');
    const update = parseCloneStatus(body);

    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException(`project ${id} not found`);
    if (project.ownerId !== req.client.ownerId) {
      throw new ForbiddenException('project does not belong to calling owner');
    }

    await this.projects.updateCloneStatus(id, update);
    return { ok: true };
  }
}

function parseCloneStatus(body: unknown): CloneStatusUpdate {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  if (b.status === 'CLONING' || b.status === 'READY' || b.status === 'NOT_CLONED') {
    return { status: b.status };
  }
  if (b.status === 'FAILED') {
    if (typeof b.error !== 'string' || !b.error) {
      throw new BadRequestException('FAILED status requires a non-empty "error" string');
    }
    return { status: 'FAILED', error: b.error };
  }
  throw new BadRequestException('status must be one of CLONING | READY | FAILED | NOT_CLONED');
}
