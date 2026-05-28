// Integration tests for RunsService.costTrendByOwner — N6 daily cost/token
// aggregate + project/harness breakdown via raw SQL.

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

async function seed() {
  const owner = await prisma.user.create({
    data: { githubId: 9300, login: 'ct-owner', role: UserRole.OWNER },
  });
  const other = await prisma.user.create({
    data: { githubId: 9301, login: 'ct-other', role: UserRole.OWNER },
  });
  const projA = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'o/a',
      localRoot: '/tmp/a',
    },
  });
  const projB = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: 2,
      repoFullName: 'o/b',
      localRoot: '/tmp/b',
    },
  });
  const projOther = await prisma.project.create({
    data: {
      ownerId: other.id,
      githubInstallationId: 1,
      githubRepoId: 3,
      repoFullName: 'x/c',
      localRoot: '/tmp/c',
    },
  });
  const harnessA = await prisma.harness.create({
    data: { ownerId: owner.id, name: 'ha', definition: {} },
  });
  const harnessB = await prisma.harness.create({
    data: { ownerId: owner.id, name: 'hb', definition: {} },
  });
  const harnessOther = await prisma.harness.create({
    data: { ownerId: other.id, name: 'ho', definition: {} },
  });
  const client = await prisma.client.create({
    data: { ownerId: owner.id, name: 'c', jwtTokenHash: 'h' },
  });
  const clientOther = await prisma.client.create({
    data: { ownerId: other.id, name: 'co', jwtTokenHash: 'h' },
  });
  return {
    owner,
    other,
    projA,
    projB,
    projOther,
    harnessA,
    harnessB,
    harnessOther,
    client,
    clientOther,
  };
}

describe('RunsService.costTrendByOwner', () => {
  it('sums cost + tokens per day, owner-scoped, excluding other owners', async () => {
    const f = await seed();
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);

    const mk = async (
      projectId: string,
      harnessId: string,
      when: Date,
      cost: number,
      tokens: number,
      ownerClient = f.client.id,
      triggeredBy = f.owner.id,
    ) => {
      await prisma.harnessRun.create({
        data: {
          harnessId,
          projectId,
          clientId: ownerClient,
          triggeredByUserId: triggeredBy,
          status: RunStatus.SUCCESS,
          startedAt: when,
          costUsd: cost,
          tokenUsage: { input: tokens / 2, output: tokens / 2, total: tokens },
        },
      });
    };

    await mk(f.projA.id, f.harnessA.id, today, 0.01, 1000);
    await mk(f.projA.id, f.harnessB.id, today, 0.02, 2000);
    await mk(f.projB.id, f.harnessA.id, yesterday, 0.03, 3000);
    // Other owner's run — must be excluded.
    await mk(f.projOther.id, f.harnessOther.id, today, 99, 99999, f.clientOther.id, f.other.id);

    const trend = await svc.costTrendByOwner(f.owner.id, { days: 30 });

    // Two distinct days.
    expect(trend.daily).toHaveLength(2);
    const totalCost = trend.daily.reduce((a, d) => a + d.cost, 0);
    expect(totalCost).toBeCloseTo(0.06, 6);
    expect(trend.totalTokens).toBe(6000);
    // Other owner's 99/99999 never counted.
    expect(trend.totalCost).toBeCloseTo(0.06, 6);
  });

  it('breaks down by project (cost desc)', async () => {
    const f = await seed();
    const now = new Date();
    const mk = async (projectId: string, cost: number) => {
      await prisma.harnessRun.create({
        data: {
          harnessId: f.harnessA.id,
          projectId,
          clientId: f.client.id,
          triggeredByUserId: f.owner.id,
          status: RunStatus.SUCCESS,
          startedAt: now,
          costUsd: cost,
          tokenUsage: { total: 100 },
        },
      });
    };
    await mk(f.projA.id, 0.05);
    await mk(f.projB.id, 0.5);

    const trend = await svc.costTrendByOwner(f.owner.id, { days: 30 });
    expect(trend.byProject.map((p) => p.repoFullName)).toEqual(['o/b', 'o/a']);
    expect(trend.byProject[0]?.cost).toBeCloseTo(0.5, 6);
  });

  it('breaks down by harness', async () => {
    const f = await seed();
    const now = new Date();
    await prisma.harnessRun.create({
      data: {
        harnessId: f.harnessA.id,
        projectId: f.projA.id,
        clientId: f.client.id,
        triggeredByUserId: f.owner.id,
        status: RunStatus.SUCCESS,
        startedAt: now,
        costUsd: 0.1,
        tokenUsage: { total: 500 },
      },
    });
    const trend = await svc.costTrendByOwner(f.owner.id, { days: 30 });
    expect(trend.byHarness).toHaveLength(1);
    expect(trend.byHarness[0]).toMatchObject({ name: 'ha', tokens: 500 });
  });

  it('excludes runs older than the window', async () => {
    const f = await seed();
    const old = new Date(Date.now() - 40 * 86_400_000);
    await prisma.harnessRun.create({
      data: {
        harnessId: f.harnessA.id,
        projectId: f.projA.id,
        clientId: f.client.id,
        triggeredByUserId: f.owner.id,
        status: RunStatus.SUCCESS,
        startedAt: old,
        costUsd: 5,
        tokenUsage: { total: 50 },
      },
    });
    const trend = await svc.costTrendByOwner(f.owner.id, { days: 30 });
    expect(trend.daily).toHaveLength(0);
    expect(trend.totalCost).toBe(0);
  });

  it('handles runs with null cost / tokenUsage as zero', async () => {
    const f = await seed();
    await prisma.harnessRun.create({
      data: {
        harnessId: f.harnessA.id,
        projectId: f.projA.id,
        clientId: f.client.id,
        triggeredByUserId: f.owner.id,
        status: RunStatus.QUEUED,
        startedAt: new Date(),
      },
    });
    const trend = await svc.costTrendByOwner(f.owner.id, { days: 30 });
    expect(trend.daily).toHaveLength(1);
    expect(trend.daily[0]?.cost).toBe(0);
    expect(trend.daily[0]?.tokens).toBe(0);
    expect(trend.daily[0]?.runs).toBe(1);
  });
});
