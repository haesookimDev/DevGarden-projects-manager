import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { PresetsService, type CreatePresetInput, type UpdatePresetInput } from './presets.service';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class PresetsInternalController {
  constructor(private readonly presets: PresetsService) {}

  @Get('projects/:projectId/presets')
  async list(@Param('projectId') projectId: string) {
    const items = await this.presets.listByProject(projectId);
    return items.map(serialize);
  }

  @Post('projects/:projectId/presets')
  async create(@Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseCreate(projectId, body);
    const preset = await this.presets.create(input);
    return serialize(preset);
  }

  @Patch('presets/:id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const patch = parseUpdate(body);
    const preset = await this.presets.update(id, patch);
    return serialize(preset);
  }

  @Delete('presets/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.presets.remove(id);
  }
}

interface SerializablePreset {
  id: string;
  projectId: string;
  name: string;
  harnessId: string;
  clientId: string;
  inputs: Prisma.JsonValue;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function serialize(p: SerializablePreset) {
  return {
    id: p.id,
    projectId: p.projectId,
    name: p.name,
    harnessId: p.harnessId,
    clientId: p.clientId,
    inputs: p.inputs,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function parseCreate(projectId: string, body: unknown): CreatePresetInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  return {
    projectId,
    name: requireString(b, 'name'),
    harnessId: requireString(b, 'harnessId'),
    clientId: requireString(b, 'clientId'),
    ...(b.inputs !== undefined ? { inputs: b.inputs as Prisma.JsonValue } : {}),
    ...(typeof b.isDefault === 'boolean' ? { isDefault: b.isDefault } : {}),
  };
}

function parseUpdate(body: unknown): UpdatePresetInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  const patch: UpdatePresetInput = {};
  if (b.name !== undefined) patch.name = requireString(b, 'name');
  if (b.harnessId !== undefined) patch.harnessId = requireString(b, 'harnessId');
  if (b.clientId !== undefined) patch.clientId = requireString(b, 'clientId');
  if (b.inputs !== undefined) patch.inputs = b.inputs as Prisma.JsonValue;
  if (b.isDefault !== undefined) {
    if (typeof b.isDefault !== 'boolean') {
      throw new BadRequestException('isDefault must be a boolean');
    }
    patch.isDefault = b.isDefault;
  }
  return patch;
}

function requireString(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string' || !v) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return v;
}
