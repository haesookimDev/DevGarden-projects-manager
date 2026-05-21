import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TodoSource, TodoStatus } from '@prisma/client';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { TodosService } from './todos.service';

@Controller('internal/todos')
@UseGuards(InternalAuthGuard)
export class TodosInternalController {
  constructor(private readonly todos: TodosService) {}

  @Get()
  async list(
    @Query('ownerId') ownerId: string | undefined,
    @Query('projectId') projectId: string | undefined,
    @Query('source') source: string | undefined,
    @Query('status') status: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    const parsedLimit = limit ? Number(limit) : undefined;
    const items = await this.todos.listByOwner(ownerId, {
      projectId,
      source: parseSource(source),
      status: parseStatus(status),
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    return items.map(projectTodo);
  }

  @Post()
  async create(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const projectId = requireString(b, 'projectId');
    const title = requireString(b, 'title');
    const todoBody = typeof b.body === 'string' ? b.body : undefined;
    const row = await this.todos.createInternal({ projectId, title, body: todoBody });
    return projectTodo({ ...row, project: { id: row.projectId, repoFullName: '' } });
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const status = parseStatus(typeof b.status === 'string' ? b.status : undefined);
    if (!status) throw new BadRequestException('status must be one of OPEN/IN_PROGRESS/DONE');
    const row = await this.todos.setStatus(id, status);
    return projectTodo({ ...row, project: { id: row.projectId, repoFullName: '' } });
  }
}

function requireString(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string' || !v) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return v;
}

function parseSource(s: string | undefined): TodoSource | undefined {
  if (!s) return undefined;
  if (s in TodoSource) return TodoSource[s as keyof typeof TodoSource];
  throw new BadRequestException(`invalid source "${s}"`);
}

function parseStatus(s: string | undefined): TodoStatus | undefined {
  if (!s) return undefined;
  if (s in TodoStatus) return TodoStatus[s as keyof typeof TodoStatus];
  throw new BadRequestException(`invalid status "${s}"`);
}

interface TodoRow {
  id: string;
  projectId: string;
  title: string;
  body: string | null;
  status: string;
  sourceType: string;
  sourceRef: number | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; repoFullName: string };
}

function projectTodo(row: TodoRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    repoFullName: row.project.repoFullName,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
