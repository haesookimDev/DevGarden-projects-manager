// Wire-level test for the preset CRUD endpoints and the run-from-preset
// dispatch path. The CRUD endpoints just thin-wrap PresetsService (already
// covered in presets-service.spec.ts), so this suite focuses on:
//   - Auth (INTERNAL_API_SECRET) is enforced
//   - HTTP body parsing rejects malformed payloads
//   - run-from-preset emits run:start with the preset's harness + inputs

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PresetsInternalController } from '../../src/projects/presets.internal.controller';
import { PresetsService } from '../../src/projects/presets.service';
import { RunsGateway } from '../../src/runs/runs.gateway';
import { RunsInternalController } from '../../src/runs/runs.internal.controller';
import { RunsService } from '../../src/runs/runs.service';

const prisma = new PrismaClient();

let app: INestApplication;
const emitRunStart = vi.fn();

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = 'preset-test-internal-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [PresetsInternalController, RunsInternalController],
    providers: [PresetsService, RunsService, { provide: RunsGateway, useValue: { emitRunStart } }],
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
  await prisma.runPreset.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

async function seedFixtures() {
  const user = await prisma.user.create({
    data: { githubId: 6000, login: 'preset-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 60,
      repoFullName: 'p/r',
      localRoot: '/tmp/p',
    },
  });
  const definition = {
    name: 'noop',
    version: 1,
    steps: [{ id: 's1', type: 'tool', use: 'fs.read', with: { path: 'x.txt' } }],
  };
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'h', definition },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client, definition };
}

describe('preset CRUD endpoints', () => {
  it('POST creates a preset and GET lists it', async () => {
    const { project, harness, client } = await seedFixtures();
    const create = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({
        name: 'default',
        harnessId: harness.id,
        clientId: client.id,
        inputs: { branch: 'main' },
        isDefault: true,
      });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({
      name: 'default',
      isDefault: true,
      inputs: { branch: 'main' },
    });

    const list = await request(app.getHttpServer())
      .get(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it('PATCH updates a preset', async () => {
    const { project, harness, client } = await seedFixtures();
    const create = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ name: 'orig', harnessId: harness.id, clientId: client.id });
    const id = create.body.id;

    const patch = await request(app.getHttpServer())
      .patch(`/internal/presets/${id}`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ name: 'renamed', inputs: { k: 'v' } });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('renamed');
    expect(patch.body.inputs).toEqual({ k: 'v' });
  });

  it('DELETE removes a preset and returns 204', async () => {
    const { project, harness, client } = await seedFixtures();
    const create = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ name: 'go', harnessId: harness.id, clientId: client.id });

    const del = await request(app.getHttpServer())
      .delete(`/internal/presets/${create.body.id}`)
      .set('x-internal-secret', 'preset-test-internal-secret');
    expect(del.status).toBe(204);

    const list = await request(app.getHttpServer())
      .get(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret');
    expect(list.body).toHaveLength(0);
  });

  it('rejects requests without the internal secret', async () => {
    const { project } = await seedFixtures();
    const res = await request(app.getHttpServer()).get(`/internal/projects/${project.id}/presets`);
    expect(res.status).toBe(401);
  });

  it('rejects a create with a non-string name with 400', async () => {
    const { project, harness, client } = await seedFixtures();
    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/presets`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ name: 42, harnessId: harness.id, clientId: client.id });
    expect(res.status).toBe(400);
  });
});

describe('POST /internal/runs/from-preset/:presetId', () => {
  it('creates a run and emits run:start with the preset harness + inputs', async () => {
    const { user, project, harness, client, definition } = await seedFixtures();
    const preset = await prisma.runPreset.create({
      data: {
        projectId: project.id,
        name: 'p',
        harnessId: harness.id,
        clientId: client.id,
        inputs: { x: 1 },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/internal/runs/from-preset/${preset.id}`)
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ triggeredByUserId: user.id, workingDir: '/tmp/p' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');
    expect(res.body.projectId).toBe(project.id);
    expect(emitRunStart).toHaveBeenCalledWith(client.id, {
      runId: res.body.id,
      harness: definition,
      inputs: { x: 1 },
      workingDir: '/tmp/p',
    });
  });

  it('returns 404 when the preset does not exist', async () => {
    const { user } = await seedFixtures();
    const res = await request(app.getHttpServer())
      .post('/internal/runs/from-preset/missing')
      .set('x-internal-secret', 'preset-test-internal-secret')
      .send({ triggeredByUserId: user.id });
    expect(res.status).toBe(404);
  });
});
