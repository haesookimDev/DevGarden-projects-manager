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
import { HarnessDryRunService } from './harness-dry-run.service';
import { HarnessesService } from './harnesses.service';

@Controller('internal/harnesses')
@UseGuards(InternalAuthGuard)
export class HarnessesInternalController {
  constructor(
    private readonly harnesses: HarnessesService,
    private readonly dryRun: HarnessDryRunService,
  ) {}

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

  // Dry-run a draft definition (YAML or already-parsed JSON) without any
  // side effects. The editor calls this on save / on demand to show what
  // would happen. Auth is the same INTERNAL_API_SECRET guard — only the
  // web BFF reaches this endpoint.
  @Post('dry-run')
  async dryRunBody(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const yaml = typeof b.yaml === 'string' ? b.yaml : undefined;
    const definition =
      typeof b.definition === 'object' && b.definition !== null ? b.definition : undefined;
    if (!yaml && !definition) {
      throw new BadRequestException('Either "yaml" (string) or "definition" (object) is required');
    }
    const inputs =
      b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs)
        ? (b.inputs as Record<string, unknown>)
        : undefined;
    return this.dryRun.run({
      ...(yaml ? { yaml } : {}),
      ...(definition ? { definition } : {}),
      ...(inputs ? { inputs } : {}),
    });
  }

  // Dry-run an already-saved harness by id. Loads the row, then passes the
  // stored definition through the same pipeline. Convenient for surfacing
  // a preview on /dashboard/harnesses/[id] without re-uploading the body.
  @Post(':id/dry-run')
  async dryRunById(@Param('id') id: string, @Body() body: unknown) {
    const harness = await this.harnesses.get(id);
    const inputs =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { inputs?: Record<string, unknown> }).inputs
        : undefined;
    return this.dryRun.run({
      definition: harness.definition,
      ...(inputs ? { inputs } : {}),
    });
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
