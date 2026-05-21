import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LogLevel, PrismaClient, RunStatus, StepKind, StepStatus, UserRole } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { RunsService } from '../../src/runs/runs.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();

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
  const user = await prisma.user.create({
    data: { githubId: 700, login: 'r-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'x/y',
      localRoot: '/tmp/x',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'h', definition: { name: 'h', version: 1, steps: [] } },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client };
}

describe('RunsService', () => {
  it('creates a run in QUEUED state with branch + workingDir', async () => {
    const { user, project, harness, client } = await seed();
    const svc = new RunsService(prisma as unknown as PrismaService);
    const run = await svc.createRun({
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
      branchName: 'feat/test',
      workingDir: '/tmp/x',
    });
    expect(run.status).toBe(RunStatus.QUEUED);
    expect(run.branchName).toBe('feat/test');
  });

  it('setStatus to SUCCESS auto-sets finishedAt', async () => {
    const { user, project, harness, client } = await seed();
    const svc = new RunsService(prisma as unknown as PrismaService);
    const run = await svc.createRun({
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
    });
    const updated = await svc.setStatus(run.id, RunStatus.SUCCESS);
    expect(updated.status).toBe(RunStatus.SUCCESS);
    expect(updated.finishedAt).not.toBeNull();
  });

  it('appendStep + appendLog persist and getRun includes both', async () => {
    const { user, project, harness, client } = await seed();
    const svc = new RunsService(prisma as unknown as PrismaService);
    const run = await svc.createRun({
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
    });
    await svc.appendStep({
      runId: run.id,
      stepIndex: 0,
      stepId: 's1',
      kind: StepKind.TOOL,
      status: StepStatus.SUCCESS,
      durationMs: 12,
    });
    await svc.appendLog({
      runId: run.id,
      level: LogLevel.INFO,
      source: 's1',
      message: 'done',
    });
    const detail = await svc.getRun(run.id);
    expect(detail.steps).toHaveLength(1);
    expect(detail.steps[0]!.stepId).toBe('s1');
    expect(detail.logs).toHaveLength(1);
    expect(detail.logs[0]!.message).toBe('done');
  });

  it('getRun throws NotFoundException for unknown id', async () => {
    const svc = new RunsService(prisma as unknown as PrismaService);
    await expect(svc.getRun('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listByProject returns runs of that project ordered by startedAt desc', async () => {
    const { user, project, harness, client } = await seed();
    const otherProject = await prisma.project.create({
      data: {
        ownerId: user.id,
        githubInstallationId: 1,
        githubRepoId: 2,
        repoFullName: 'x/other',
        localRoot: '/tmp/other',
      },
    });
    const svc = new RunsService(prisma as unknown as PrismaService);
    await svc.createRun({
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
    });
    await new Promise((r) => setTimeout(r, 5));
    await svc.createRun({
      harnessId: harness.id,
      projectId: project.id,
      clientId: client.id,
      triggeredByUserId: user.id,
    });
    await svc.createRun({
      harnessId: harness.id,
      projectId: otherProject.id,
      clientId: client.id,
      triggeredByUserId: user.id,
    });
    const list = await svc.listByProject(project.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.startedAt.getTime()).toBeGreaterThan(list[1]!.startedAt.getTime());
  });
});
