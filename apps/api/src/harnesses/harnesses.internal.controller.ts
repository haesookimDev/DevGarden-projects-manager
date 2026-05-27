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
import { HarnessesService } from './harnesses.service';

@Controller('internal/harnesses')
@UseGuards(InternalAuthGuard)
export class HarnessesInternalController {
  constructor(private readonly harnesses: HarnessesService) {}

  // Listing modes:
  //   ?ownerId=...              → latest version per (ownerId, name) — the
  //                               dashboard's list (default behavior).
  //   ?ownerId=...&latest=false → every version of every harness — history.
  //   ?ownerId=...&name=...     → every version of a single name, newest first.
  @Get()
  async list(
    @Query('ownerId') ownerId: string,
    @Query('name') name: string | undefined,
    @Query('latest') latestRaw: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    if (name) {
      const items = await this.harnesses.listVersionsByName(ownerId, name);
      return items.map(project);
    }
    const latestOnly = latestRaw === 'false' ? false : true;
    const items = await this.harnesses.listByOwner(ownerId, { latestOnly });
    return items.map(project);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.harnesses.get(id);
    return { ...project(row), definition: row.definition };
  }

  @Post()
  async create(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const ownerId = requireString(b, 'ownerId');
    const name = requireString(b, 'name');
    if (typeof b.definition !== 'object' || b.definition === null) {
      throw new BadRequestException('definition must be a JSON object');
    }
    const source = typeof b.source === 'string' ? b.source : undefined;
    const row = await this.harnesses.create({
      ownerId,
      name,
      definition: b.definition,
      source,
    });
    return project(row);
  }
}

function requireString(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string' || !v) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return v;
}

interface HarnessRow {
  id: string;
  ownerId: string;
  name: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function project(row: HarnessRow) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
