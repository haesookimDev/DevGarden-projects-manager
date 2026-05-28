// Integration tests for RunsService.getTimeline — the N6 Gantt data source.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient, RunStatus, StepKind, StepStatus, UserRole } from '@prisma/client';
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

async function seedRun() {
  const user = await prisma.user.create({
    data: { githubId: 9100, login: 'tl-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'tl/p',
      localRoot: '/tmp/tl',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'h', definition: { name: 'h', version: 1, steps: [] } },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  const start = new Date('2026-05-01T00:00:00Z');
  const run = await prisma.harnessRun.create({
    data: {
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
      status: RunStatus.SUCCESS,
      startedAt: start,
      finishedAt: new Date(start.getTime() + 10_000),
    },
  });
  return { user, run, start };
}

describe('RunsService.getTimeline', () => {
  it('derives per-step offsets from createdAt - durationMs', async () => {
    const { run, start } = await seedRun();
    // step 0: recorded at +2s, took 2s → window [0, 2000]
    await prisma.runStep.create({
      data: {
        runId: run.id,
        stepIndex: 0,
        stepId: 'a',
        kind: StepKind.TOOL,
        status: StepStatus.SUCCESS,
        durationMs: 2000,
        createdAt: new Date(start.getTime() + 2000),
      },
    });
    // step 1: recorded at +9s, took 7s → window [2000, 9000] (the longest)
    await prisma.runStep.create({
      data: {
        runId: run.id,
        stepIndex: 1,
        stepId: 'b',
        kind: StepKind.LLM,
        status: StepStatus.SUCCESS,
        durationMs: 7000,
        createdAt: new Date(start.getTime() + 9000),
      },
    });

    const tl = await svc.getTimeline(run.id);
    expect(tl.runId).toBe(run.id);
    expect(tl.totalMs).toBe(10_000);
    expect(tl.steps).toHaveLength(2);
    expect(tl.steps[0]).toMatchObject({
      stepId: 'a',
      startOffsetMs: 0,
      durationMs: 2000,
    });
    expect(tl.steps[1]).toMatchObject({
      stepId: 'b',
      startOffsetMs: 2000,
      durationMs: 7000,
    });
    expect(tl.longestStepIndex).toBe(1);
  });

  it('orders steps by stepIndex', async () => {
    const { run, start } = await seedRun();
    for (const [idx, ms] of [
      [2, 9000],
      [0, 1000],
      [1, 5000],
    ] as const) {
      await prisma.runStep.create({
        data: {
          runId: run.id,
          stepIndex: idx,
          stepId: `s${idx}`,
          kind: StepKind.TOOL,
          status: StepStatus.SUCCESS,
          durationMs: 500,
          createdAt: new Date(start.getTime() + ms),
        },
      });
    }
    const tl = await svc.getTimeline(run.id);
    expect(tl.steps.map((s) => s.stepIndex)).toEqual([0, 1, 2]);
  });

  it('handles a run with no steps (empty timeline)', async () => {
    const { run } = await seedRun();
    const tl = await svc.getTimeline(run.id);
    expect(tl.steps).toEqual([]);
    expect(tl.longestStepIndex).toBeNull();
  });

  it('treats a null durationMs as a zero-length bar', async () => {
    const { run, start } = await seedRun();
    await prisma.runStep.create({
      data: {
        runId: run.id,
        stepIndex: 0,
        stepId: 'a',
        kind: StepKind.CONDITION,
        status: StepStatus.SKIPPED,
        durationMs: null,
        createdAt: new Date(start.getTime() + 3000),
      },
    });
    const tl = await svc.getTimeline(run.id);
    expect(tl.steps[0]).toMatchObject({ startOffsetMs: 3000, durationMs: 0 });
  });

  it('throws NotFoundException for an unknown run id', async () => {
    await expect(svc.getTimeline('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
