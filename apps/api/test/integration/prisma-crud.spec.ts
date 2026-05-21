import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, WorktreePolicy } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('prisma — basic CRUD against migrated schema', () => {
  it('inserts and reads a user', async () => {
    const created = await prisma.user.create({
      data: {
        githubId: 1001,
        login: 'alice',
        email: 'alice@example.com',
        role: UserRole.OWNER,
      },
    });

    const found = await prisma.user.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found?.login).toBe('alice');
    expect(found?.role).toBe(UserRole.OWNER);
  });

  it('enforces unique githubId', async () => {
    await prisma.user.create({
      data: { githubId: 2002, login: 'bob' },
    });

    await expect(
      prisma.user.create({
        data: { githubId: 2002, login: 'bob-dup' },
      }),
    ).rejects.toThrow();
  });

  it('cascade-deletes Project when User is deleted', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 3003, login: 'carol' },
    });

    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        githubInstallationId: 1,
        githubRepoId: 9999,
        repoFullName: 'carol/repo',
        localRoot: '/tmp/carol-repo',
        worktreePolicy: WorktreePolicy.AUTO_REMOVE_SUCCESS,
      },
    });

    await prisma.user.delete({ where: { id: owner.id } });

    const orphan = await prisma.project.findUnique({ where: { id: project.id } });
    expect(orphan).toBeNull();
  });
});
