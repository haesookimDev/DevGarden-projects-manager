// Controller-level integration test for N5 run controls: real prisma + a stub
// gateway. Covers the cancel state machine (QUEUED flip / RUNNING request +
// emit / already-finished no-op) and retry cloning (new linked row + dispatch,
// reject non-terminal).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, RunStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PresetsService } from '../../src/projects/presets.service';
import { RunsGateway } from '../../src/runs/runs.gateway';
import { RunsInternalController } from '../../src/runs/runs.internal.controller';
import { RunsService } from '../../src/runs/runs.service';

const prisma = new PrismaClient();
const SECRET = 'cancel-retry-secret';

let app: INestApplication;
const emitRunStart = vi.fn();
const emitRunCancel = vi.fn();

const definition = {
  name: 'echo',
  version: 1,
  steps: [{ id: 's1', type: 'tool', use: 'fs.write', with: { path: 'a.txt', content: 'hi' } }],
};

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = SECRET;

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [RunsInternalController],
    providers: [
      RunsService,
      PresetsService,
      { provide: RunsGateway, useValue: { emitRunStart, emitRunCancel } },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  emitRunStart.mockReset();
  emitRunCancel.mockReset();
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
    data: { githubId: 900, login: 'ctl-owner', role: UserRole.OWNER },
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
    data: { ownerId: user.id, name: 'h', definition },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client };
}

async function makeRun(
  ids: {
    user: { id: string };
    project: { id: string };
    harness: { id: string };
    client: { id: string };
  },
  status: RunStatus,
  extra: { inputs?: object; branchName?: string; workingDir?: string } = {},
) {
  return prisma.harnessRun.create({
    data: {
      harnessId: ids.harness.id,
      projectId: ids.project.id,
      clientId: ids.client.id,
      triggeredByUserId: ids.user.id,
      status,
      inputs: extra.inputs ?? {},
      branchName: extra.branchName,
      workingDir: extra.workingDir,
    },
  });
}

function post(path: string, body: object = {}) {
  return request(app.getHttpServer()).post(path).set('x-internal-secret', SECRET).send(body);
}

describe('POST /internal/runs/:id/cancel', () => {
  it('flips a QUEUED run straight to CANCELLED without emitting run:cancel', async () => {
    const ids = await seed();
    const run = await makeRun(ids, RunStatus.QUEUED);

    const res = await post(`/internal/runs/${run.id}/cancel`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelRequested).toBe(true);
    expect(res.body.alreadyFinished).toBe(false);
    expect(res.body.cancelledAt).not.toBeNull();
    expect(emitRunCancel).not.toHaveBeenCalled();

    const row = await prisma.harnessRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row.status).toBe(RunStatus.CANCELLED);
    expect(row.finishedAt).not.toBeNull();
  });

  it('marks a RUNNING run for cancel and emits run:cancel to its client', async () => {
    const ids = await seed();
    const run = await makeRun(ids, RunStatus.RUNNING);

    const res = await post(`/internal/runs/${run.id}/cancel`, { reason: 'user stop' });

    expect(res.status).toBe(201);
    // Status stays RUNNING until the sidecar confirms.
    expect(res.body.status).toBe('RUNNING');
    expect(res.body.cancelRequested).toBe(true);
    expect(res.body.cancelRequestedAt).not.toBeNull();
    expect(emitRunCancel).toHaveBeenCalledTimes(1);
    expect(emitRunCancel).toHaveBeenCalledWith(ids.client.id, {
      runId: run.id,
      reason: 'user stop',
    });

    const row = await prisma.harnessRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row.status).toBe(RunStatus.RUNNING);
    expect(row.cancelRequestedAt).not.toBeNull();
    expect(row.cancelReason).toBe('user stop');
  });

  it('no-ops cancelling a run that already finished', async () => {
    const ids = await seed();
    const run = await makeRun(ids, RunStatus.SUCCESS);

    const res = await post(`/internal/runs/${run.id}/cancel`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.alreadyFinished).toBe(true);
    expect(res.body.cancelRequested).toBe(false);
    expect(emitRunCancel).not.toHaveBeenCalled();
  });
});

describe('POST /internal/runs/:id/retry', () => {
  it('clones a FAILED run into a linked QUEUED run and dispatches it', async () => {
    const ids = await seed();
    const orig = await makeRun(ids, RunStatus.FAILED, {
      inputs: { name: 'demo' },
      branchName: 'feat/x',
      workingDir: '/tmp/x',
    });

    const res = await post(`/internal/runs/${orig.id}/retry`, { triggeredByUserId: ids.user.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');
    expect(res.body.id).not.toBe(orig.id);
    expect(res.body.retryOfRunId).toBe(orig.id);

    expect(emitRunStart).toHaveBeenCalledTimes(1);
    expect(emitRunStart).toHaveBeenCalledWith(ids.client.id, {
      runId: res.body.id,
      harness: definition,
      inputs: { name: 'demo' },
      workingDir: '/tmp/x',
    });

    const row = await prisma.harnessRun.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.inputs).toEqual({ name: 'demo' });
    expect(row.branchName).toBe('feat/x');
  });

  it('rejects retrying a RUNNING run', async () => {
    const ids = await seed();
    const run = await makeRun(ids, RunStatus.RUNNING);

    const res = await post(`/internal/runs/${run.id}/retry`);

    expect(res.status).toBe(400);
    expect(emitRunStart).not.toHaveBeenCalled();
  });
});
