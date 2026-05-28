// Integration tests for RunsService.searchByOwner — the N6 filtered +
// paginated runs search. Exercises filter accuracy + pagination directly
// against the service (the controller is a thin query-param wrapper).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, RunStatus, UserRole } from '@prisma/client';
import { RunsService } from '../../src/runs/runs.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();
const svc = new RunsService(prisma as unknown as PrismaService);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

interface Fixture {
  ownerId: string;
  projectAId: string;
  projectBId: string;
  harnessId: string;
  clientId: string;
}

async function seed(): Promise<Fixture> {
  const owner = await prisma.user.create({
    data: { githubId: 8000, login: 'search-owner', role: UserRole.OWNER },
  });
  const other = await prisma.user.create({
    data: { githubId: 8001, login: 'other-owner', role: UserRole.OWNER },
  });
  const projectA = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'o/a',
      localRoot: '/tmp/a',
    },
  });
  const projectB = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: 2,
      repoFullName: 'o/b',
      localRoot: '/tmp/b',
    },
  });
  // A project owned by someone else — must never appear in owner's search.
  const projectOther = await prisma.project.create({
    data: {
      ownerId: other.id,
      githubInstallationId: 1,
      githubRepoId: 3,
      repoFullName: 'x/c',
      localRoot: '/tmp/c',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: owner.id, name: 'h', definition: { name: 'h', version: 1, steps: [] } },
  });
  const client = await prisma.client.create({
    data: { ownerId: owner.id, name: 'c', jwtTokenHash: 'h' },
  });

  // 5 runs in project A spread across statuses + time; 2 in B; 1 in other.
  const base = Date.parse('2026-05-01T00:00:00Z');
  const mk = async (projectId: string, status: RunStatus, daysAgo: number, branchName?: string) => {
    await prisma.harnessRun.create({
      data: {
        harnessId: harness.id,
        projectId,
        clientId: client.id,
        triggeredByUserId: owner.id,
        status,
        branchName: branchName ?? null,
        startedAt: new Date(base + daysAgo * 86_400_000),
      },
    });
  };
  await mk(projectA.id, RunStatus.SUCCESS, 1, 'feat/login');
  await mk(projectA.id, RunStatus.FAILED, 2);
  await mk(projectA.id, RunStatus.SUCCESS, 3);
  await mk(projectA.id, RunStatus.RUNNING, 4);
  await mk(projectA.id, RunStatus.SUCCESS, 5);
  await mk(projectB.id, RunStatus.FAILED, 1);
  await mk(projectB.id, RunStatus.SUCCESS, 2);
  await prisma.harnessRun.create({
    data: {
      harnessId: (
        await prisma.harness.create({
          data: { ownerId: other.id, name: 'oh', definition: {} },
        })
      ).id,
      projectId: projectOther.id,
      clientId: (
        await prisma.client.create({
          data: { ownerId: other.id, name: 'oc', jwtTokenHash: 'h' },
        })
      ).id,
      triggeredByUserId: other.id,
      status: RunStatus.SUCCESS,
      startedAt: new Date(base),
    },
  });

  return {
    ownerId: owner.id,
    projectAId: projectA.id,
    projectBId: projectB.id,
    harnessId: harness.id,
    clientId: client.id,
  };
}

describe('RunsService.searchByOwner', () => {
  it('returns only the owner runs (7), excluding other owners', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, pageSize: 100 });
    expect(res.total).toBe(7);
    expect(res.items).toHaveLength(7);
    expect(res.items.every((r) => r.project.repoFullName !== 'x/c')).toBe(true);
  });

  it('filters by project', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, projectId: f.projectAId });
    expect(res.total).toBe(5);
    expect(res.items.every((r) => r.projectId === f.projectAId)).toBe(true);
  });

  it('filters by status', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, status: RunStatus.SUCCESS });
    expect(res.total).toBe(4); // 3 in A + 1 in B
  });

  it('filters by a since/until date range', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({
      ownerId: f.ownerId,
      since: new Date('2026-05-02T00:00:00Z'),
      until: new Date('2026-05-04T00:00:00Z'),
    });
    // A: 05-02, 05-03, 05-04 (3) + B: 05-02, 05-03 (2) = 5
    expect(res.total).toBe(5);
  });

  it('free-text q matches branch name (case-insensitive)', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, q: 'LOGIN' });
    expect(res.total).toBe(1);
    expect(res.items[0]?.branchName).toBe('feat/login');
  });

  it('paginates: page 1 + page 2 cover distinct rows', async () => {
    const f = await seed();
    const p1 = await svc.searchByOwner({ ownerId: f.ownerId, page: 1, pageSize: 4 });
    const p2 = await svc.searchByOwner({ ownerId: f.ownerId, page: 2, pageSize: 4 });
    expect(p1.items).toHaveLength(4);
    expect(p2.items).toHaveLength(3);
    expect(p1.total).toBe(7);
    expect(p2.total).toBe(7);
    const overlap = p1.items.filter((a) => p2.items.some((b) => b.id === a.id));
    expect(overlap).toHaveLength(0);
  });

  it('orders newest-first by startedAt', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, projectId: f.projectAId });
    const times = res.items.map((r) => r.startedAt.getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it('includes project + harness relations in items', async () => {
    const f = await seed();
    const res = await svc.searchByOwner({ ownerId: f.ownerId, pageSize: 1 });
    expect(res.items[0]?.project.repoFullName).toBeTruthy();
    expect(res.items[0]?.harness.name).toBe('h');
  });
});
