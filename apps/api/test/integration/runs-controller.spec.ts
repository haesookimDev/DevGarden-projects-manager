// Full controller-level integration test: real prisma + stub gateway. Verifies
// that POST /internal/runs creates the row AND dispatches `run:start` with the
// stored harness definition.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RunsGateway } from '../../src/runs/runs.gateway';
import { RunsInternalController } from '../../src/runs/runs.internal.controller';
import { RunsService } from '../../src/runs/runs.service';

const prisma = new PrismaClient();

let app: INestApplication;
const emitRunStart = vi.fn();

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = 'controller-test-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [RunsInternalController],
    providers: [
      RunsService,
      { provide: RunsGateway, useValue: { emitRunStart } },
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
    data: { githubId: 800, login: 'ctl-owner', role: UserRole.OWNER },
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
  const definition = {
    name: 'echo',
    version: 1,
    steps: [{ id: 's1', type: 'tool', use: 'fs.write', with: { path: 'a.txt', content: 'hi' } }],
  };
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'h', definition },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client, definition };
}

describe('POST /internal/runs', () => {
  it('creates a run and emits run:start with harness + inputs', async () => {
    const { user, project, harness, client, definition } = await seed();

    const res = await request(app.getHttpServer())
      .post('/internal/runs')
      .set('x-internal-secret', 'controller-test-secret')
      .send({
        harnessId: harness.id,
        projectId: project.id,
        clientId: client.id,
        triggeredByUserId: user.id,
        workingDir: '/tmp/x',
        inputs: { name: 'demo' },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');

    expect(emitRunStart).toHaveBeenCalledTimes(1);
    expect(emitRunStart).toHaveBeenCalledWith(client.id, {
      runId: res.body.id,
      harness: definition,
      inputs: { name: 'demo' },
      workingDir: '/tmp/x',
    });
  });

  it('rejects requests without the internal secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/runs')
      .send({ harnessId: 'x', projectId: 'x', clientId: 'x', triggeredByUserId: 'x' });
    expect(res.status).toBe(401);
    expect(emitRunStart).not.toHaveBeenCalled();
  });
});
