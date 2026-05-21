import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient, TodoSource, TodoStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TodosService } from '../../src/todos/todos.service';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.todoItem.deleteMany();
  await prisma.githubEvent.deleteMany();
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

async function seed() {
  const user = await prisma.user.create({
    data: { githubId: 600, login: 't-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 't/repo',
      localRoot: '/tmp/t',
    },
  });
  return { user, project };
}

describe('TodosService', () => {
  it('createInternal stores an INTERNAL todo with status OPEN', async () => {
    const { project } = await seed();
    const svc = new TodosService(prisma as unknown as PrismaService);
    const row = await svc.createInternal({ projectId: project.id, title: 'do thing' });
    expect(row.sourceType).toBe(TodoSource.INTERNAL);
    expect(row.status).toBe(TodoStatus.OPEN);
    expect(row.sourceRef).toBeNull();
  });

  it('createInternal throws NotFound for unknown project', async () => {
    const svc = new TodosService(prisma as unknown as PrismaService);
    await expect(svc.createInternal({ projectId: 'nope', title: 't' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('listByOwner returns todos from all projects, filtered by source/status', async () => {
    const { user, project } = await seed();
    const other = await prisma.project.create({
      data: {
        ownerId: user.id,
        githubInstallationId: 1,
        githubRepoId: 2,
        repoFullName: 't/other',
        localRoot: '/tmp/t2',
      },
    });
    const svc = new TodosService(prisma as unknown as PrismaService);
    await svc.createInternal({ projectId: project.id, title: 'internal-1' });
    await svc.createInternal({ projectId: other.id, title: 'internal-2' });
    await prisma.todoItem.create({
      data: {
        projectId: project.id,
        title: 'issue-3',
        sourceType: TodoSource.GITHUB_ISSUE,
        sourceRef: 3,
      },
    });

    const all = await svc.listByOwner(user.id);
    expect(all).toHaveLength(3);
    expect(all[0]!.project.repoFullName).toBeTruthy();

    const onlyIssue = await svc.listByOwner(user.id, { source: TodoSource.GITHUB_ISSUE });
    expect(onlyIssue).toHaveLength(1);
    expect(onlyIssue[0]!.title).toBe('issue-3');

    const onlyProject = await svc.listByOwner(user.id, { projectId: other.id });
    expect(onlyProject).toHaveLength(1);
    expect(onlyProject[0]!.title).toBe('internal-2');
  });

  it('setStatus updates and throws NotFound for unknown id', async () => {
    const { project } = await seed();
    const svc = new TodosService(prisma as unknown as PrismaService);
    const row = await svc.createInternal({ projectId: project.id, title: 't' });
    const updated = await svc.setStatus(row.id, TodoStatus.DONE);
    expect(updated.status).toBe(TodoStatus.DONE);
    await expect(svc.setStatus('does-not-exist', TodoStatus.DONE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
