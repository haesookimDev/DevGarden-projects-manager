import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, RunPreset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePresetInput {
  projectId: string;
  name: string;
  harnessId: string;
  clientId: string;
  inputs?: Prisma.JsonValue;
  isDefault?: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  harnessId?: string;
  clientId?: string;
  inputs?: Prisma.JsonValue;
  isDefault?: boolean;
}

@Injectable()
export class PresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePresetInput): Promise<RunPreset> {
    await this.assertProjectExists(input.projectId);
    await this.assertHarnessBelongsToOwner(input.harnessId, input.projectId);
    await this.assertClientBelongsToOwner(input.clientId, input.projectId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.runPreset.updateMany({
            where: { projectId: input.projectId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.runPreset.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            harnessId: input.harnessId,
            clientId: input.clientId,
            inputs: (input.inputs ?? {}) as Prisma.InputJsonValue,
            isDefault: input.isDefault ?? false,
          },
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(
          `Preset "${input.name}" already exists for project ${input.projectId}`,
        );
      }
      throw err;
    }
  }

  listByProject(projectId: string): Promise<RunPreset[]> {
    return this.prisma.runPreset.findMany({
      where: { projectId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getById(id: string): Promise<RunPreset> {
    const preset = await this.prisma.runPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException(`preset ${id} not found`);
    return preset;
  }

  async update(id: string, patch: UpdatePresetInput): Promise<RunPreset> {
    const existing = await this.getById(id);

    if (patch.harnessId) {
      await this.assertHarnessBelongsToOwner(patch.harnessId, existing.projectId);
    }
    if (patch.clientId) {
      await this.assertClientBelongsToOwner(patch.clientId, existing.projectId);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (patch.isDefault === true) {
          await tx.runPreset.updateMany({
            where: { projectId: existing.projectId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }
        return tx.runPreset.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.harnessId !== undefined ? { harnessId: patch.harnessId } : {}),
            ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
            ...(patch.inputs !== undefined ? { inputs: patch.inputs as Prisma.InputJsonValue } : {}),
            ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
          },
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(
          `Preset "${patch.name}" already exists for project ${existing.projectId}`,
        );
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.runPreset.delete({ where: { id } });
    } catch (err) {
      if (isRecordNotFoundError(err)) {
        throw new NotFoundException(`preset ${id} not found`);
      }
      throw err;
    }
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException(`project ${projectId} not found`);
  }

  // Presets can only point at harnesses + clients owned by the same user as
  // the project. This prevents cross-tenant leaks once multi-user lands in
  // v0.3+; for now everyone is the same owner anyway, but the guard is cheap.
  private async assertHarnessBelongsToOwner(harnessId: string, projectId: string): Promise<void> {
    const [project, harness] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      }),
      this.prisma.harness.findUnique({
        where: { id: harnessId },
        select: { ownerId: true },
      }),
    ]);
    if (!harness) throw new BadRequestException(`harness ${harnessId} not found`);
    if (!project || harness.ownerId !== project.ownerId) {
      throw new BadRequestException(
        `harness ${harnessId} does not belong to the project owner`,
      );
    }
  }

  private async assertClientBelongsToOwner(clientId: string, projectId: string): Promise<void> {
    const [project, client] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      }),
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: { ownerId: true },
      }),
    ]);
    if (!client) throw new BadRequestException(`client ${clientId} not found`);
    if (!project || client.ownerId !== project.ownerId) {
      throw new BadRequestException(
        `client ${clientId} does not belong to the project owner`,
      );
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

function isRecordNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2025'
  );
}
