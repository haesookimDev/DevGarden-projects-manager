import { Injectable, NotFoundException } from '@nestjs/common';
import { type TodoItem, TodoSource, TodoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateInternalTodoInput {
  projectId: string;
  title: string;
  body?: string;
}

export interface ListTodosOptions {
  projectId?: string;
  source?: TodoSource;
  status?: TodoStatus;
  limit?: number;
}

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  async createInternal(input: CreateInternalTodoInput): Promise<TodoItem> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException(`project ${input.projectId} not found`);

    return this.prisma.todoItem.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        body: input.body,
        sourceType: TodoSource.INTERNAL,
      },
    });
  }

  /**
   * List todos for an owner across their projects, optionally filtered by
   * project / source / status. Limit clamped to [1, 200].
   */
  listByOwner(
    ownerId: string,
    opts: ListTodosOptions = {},
  ): Promise<Array<TodoItem & { project: { id: string; repoFullName: string } }>> {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    return this.prisma.todoItem.findMany({
      where: {
        project: { ownerId },
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        ...(opts.source ? { sourceType: opts.source } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
      include: { project: { select: { id: true, repoFullName: true } } },
    });
  }

  async setStatus(id: string, status: TodoStatus): Promise<TodoItem> {
    const existing = await this.prisma.todoItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`todo ${id} not found`);
    return this.prisma.todoItem.update({ where: { id }, data: { status } });
  }
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
