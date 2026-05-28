// Wire-level test for the PATCH /internal/projects/:id/defaults endpoint —
// the settings UI on /dashboard/projects/[id]/settings posts here to change
// defaultHarnessId / defaultHarnessVersion / defaultClientId.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { ClientsGateway } from '../../src/clients/clients.gateway';
import { GithubAppService } from '../../src/github/github-app.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PresetsService } from '../../src/projects/presets.service';
import { ProjectsInternalController } from '../../src/projects/projects.internal.controller';
import { ProjectsService } from '../../src/projects/projects.service';

const prisma = new PrismaClient();

let app: INestApplication;

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = 'defaults-test-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [ProjectsInternalController],
    providers: [
      ProjectsService,
      PresetsService,
      { provide: ClientsGateway, useValue: { emitCloneStart: vi.fn() } },
      { provide: GithubAppService, useValue: {} },
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
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.runPreset.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

async function seed() {
  const user = await prisma.user.create({
    data: { githubId: 7000, login: 'defaults-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 10,
      repoFullName: 'd/p',
      localRoot: '/tmp/d',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'echo', definition: { name: 'echo', version: 1, steps: [] } },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c1', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client };
}

describe('PATCH /internal/projects/:id/defaults', () => {
  it('updates defaultHarnessId + defaultHarnessVersion + defaultClientId', async () => {
    const { project, harness, client } = await seed();
    const res = await request(app.getHttpServer())
      .patch(`/internal/projects/${project.id}/defaults`)
      .set('x-internal-secret', 'defaults-test-secret')
      .send({
        defaultHarnessId: harness.id,
        defaultHarnessVersion: 2,
        defaultClientId: client.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.defaultHarnessId).toBe(harness.id);
    expect(res.body.defaultHarnessVersion).toBe(2);
    expect(res.body.defaultClientId).toBe(client.id);

    const reloaded = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reloaded?.defaultHarnessVersion).toBe(2);
  });

  it('null defaultHarnessVersion clears the pin (follow latest)', async () => {
    const { project, harness } = await seed();
    await prisma.project.update({
      where: { id: project.id },
      data: { defaultHarnessId: harness.id, defaultHarnessVersion: 3 },
    });
    const res = await request(app.getHttpServer())
      .patch(`/internal/projects/${project.id}/defaults`)
      .set('x-internal-secret', 'defaults-test-secret')
      .send({ defaultHarnessVersion: null });
    expect(res.status).toBe(200);
    expect(res.body.defaultHarnessVersion).toBeNull();
  });

  it('omitting a field leaves it untouched', async () => {
    const { project, harness, client } = await seed();
    await prisma.project.update({
      where: { id: project.id },
      data: { defaultHarnessId: harness.id, defaultClientId: client.id },
    });
    const res = await request(app.getHttpServer())
      .patch(`/internal/projects/${project.id}/defaults`)
      .set('x-internal-secret', 'defaults-test-secret')
      .send({ defaultHarnessVersion: 5 });
    expect(res.status).toBe(200);
    expect(res.body.defaultHarnessVersion).toBe(5);
    expect(res.body.defaultHarnessId).toBe(harness.id);
    expect(res.body.defaultClientId).toBe(client.id);
  });

  it('rejects a harness owned by another user with 400', async () => {
    const { project } = await seed();
    const otherOwner = await prisma.user.create({
      data: { githubId: 7001, login: 'other', role: UserRole.OWNER },
    });
    const otherHarness = await prisma.harness.create({
      data: {
        ownerId: otherOwner.id,
        name: 'oh',
        definition: { name: 'oh', version: 1, steps: [] },
      },
    });
    const res = await request(app.getHttpServer())
      .patch(`/internal/projects/${project.id}/defaults`)
      .set('x-internal-secret', 'defaults-test-secret')
      .send({ defaultHarnessId: otherHarness.id });
    expect(res.status).toBe(400);
  });

  it('rejects defaultHarnessVersion < 1 with 400', async () => {
    const { project } = await seed();
    const res = await request(app.getHttpServer())
      .patch(`/internal/projects/${project.id}/defaults`)
      .set('x-internal-secret', 'defaults-test-secret')
      .send({ defaultHarnessVersion: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await request(app.getHttpServer())
      .patch('/internal/projects/missing/defaults')
      .set('x-internal-secret', 'defaults-test-secret')
      .send({ defaultHarnessVersion: 2 });
    expect(res.status).toBe(404);
  });

  it('rejects requests without the internal secret', async () => {
    const res = await request(app.getHttpServer())
      .patch('/internal/projects/anything/defaults')
      .send({ defaultHarnessVersion: 2 });
    expect(res.status).toBe(401);
  });
});
