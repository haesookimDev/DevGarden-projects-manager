// Wire-level test for the three N3 PR3 clone endpoints:
//   POST /internal/projects/:id/clone           (BFF, INTERNAL_API_SECRET)
//   POST /internal/projects/:id/clone-status    (sidecar, JWT)
//   POST /internal/clients/installation-tokens  (sidecar, JWT)

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { ClientJwtAuthGuard } from '../../src/auth/client-jwt-auth.guard';
import { ClientJwtService } from '../../src/clients/client-jwt.service';
import { ClientsGateway } from '../../src/clients/clients.gateway';
import { ClientsSidecarController } from '../../src/clients/clients.sidecar.controller';
import { GithubAppService } from '../../src/github/github-app.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PresetsService } from '../../src/projects/presets.service';
import { ProjectsInternalController } from '../../src/projects/projects.internal.controller';
import { ProjectsSidecarController } from '../../src/projects/projects.sidecar.controller';
import { ProjectsService } from '../../src/projects/projects.service';

const prisma = new PrismaClient();

let app: INestApplication;
const emitCloneStart = vi.fn();
const getInstallationToken = vi.fn();

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = 'clone-test-internal-secret';
  process.env.AUTH_SECRET = 'clone-test-secret-with-enough-length-please';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [ProjectsInternalController, ProjectsSidecarController, ClientsSidecarController],
    providers: [
      ProjectsService,
      PresetsService,
      ClientJwtService,
      ClientJwtAuthGuard,
      { provide: ClientsGateway, useValue: { emitCloneStart } },
      { provide: GithubAppService, useValue: { getInstallationToken } },
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
  emitCloneStart.mockReset();
  getInstallationToken.mockReset();
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.runPreset.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.githubInstallation.deleteMany();
  await prisma.githubAppRegistration.deleteMany();
  await prisma.user.deleteMany();
});

async function seed(overrides: { installationId?: number } = {}) {
  const installationId = overrides.installationId ?? 7777;
  const user = await prisma.user.create({
    data: { githubId: 9001, login: 'cloner', role: UserRole.OWNER },
  });
  const reg = await prisma.githubAppRegistration.create({
    data: {
      ownerId: user.id,
      source: 'BYO',
      appId: 12345,
      webhookSecret: Buffer.from('s'),
      privateKeyPem: Buffer.from('p'),
    },
  });
  const install = await prisma.githubInstallation.create({
    data: {
      registrationId: reg.id,
      installationId,
      accountLogin: 'cloner',
      accountType: 'User',
      accountId: 1,
      permissions: {},
      events: [],
      repositorySelection: 'all',
    },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: installationId,
      installationDbId: install.id,
      githubRepoId: 1,
      repoFullName: 'cloner/repo',
      localRoot: '/tmp/cloner-repo',
    },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'desktop', jwtTokenHash: 'h' },
  });
  const jwt = await new ClientJwtService().sign({ clientId: client.id, ownerId: user.id });
  return { user, project, client, jwt, installationId };
}

describe('POST /internal/projects/:id/clone (BFF dispatch)', () => {
  it('flips cloneStatus to CLONING and dispatches client:cloneProject', async () => {
    const { project, client, installationId } = await seed();

    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone`)
      .set('x-internal-secret', 'clone-test-internal-secret')
      .send({ clientId: client.id, targetPath: '/tmp/desktop-clone' });

    expect(res.status).toBe(201);
    const reloaded = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reloaded?.cloneStatus).toBe('CLONING');
    expect(reloaded?.localRoot).toBe('/tmp/desktop-clone');
    expect(emitCloneStart).toHaveBeenCalledWith(client.id, {
      projectId: project.id,
      installationId,
      repoFullName: 'cloner/repo',
      targetPath: '/tmp/desktop-clone',
      useWorktrees: false,
    });
  });

  it('rejects a cross-owner clientId with 403', async () => {
    const { project } = await seed();
    const otherOwner = await prisma.user.create({
      data: { githubId: 9002, login: 'other', role: UserRole.OWNER },
    });
    const otherClient = await prisma.client.create({
      data: { ownerId: otherOwner.id, name: 'other-desktop', jwtTokenHash: 'h' },
    });

    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone`)
      .set('x-internal-secret', 'clone-test-internal-secret')
      .send({ clientId: otherClient.id, targetPath: '/tmp/x' });

    expect(res.status).toBe(403);
    expect(emitCloneStart).not.toHaveBeenCalled();
  });

  it('rejects requests without the internal secret', async () => {
    const { project, client } = await seed();
    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone`)
      .send({ clientId: client.id, targetPath: '/tmp/x' });
    expect(res.status).toBe(401);
  });
});

describe('POST /internal/projects/:id/clone-status (sidecar webhook)', () => {
  it('accepts a CLONING report from the project owner sidecar', async () => {
    const { project, jwt } = await seed();

    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone-status`)
      .set('authorization', `Bearer ${jwt}`)
      .send({ status: 'CLONING' });

    expect(res.status).toBe(201);
    const reloaded = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reloaded?.cloneStatus).toBe('CLONING');
  });

  it('rejects a JWT belonging to a different owner with 403', async () => {
    const { project } = await seed();
    const otherOwner = await prisma.user.create({
      data: { githubId: 9003, login: 'other2', role: UserRole.OWNER },
    });
    const otherClient = await prisma.client.create({
      data: { ownerId: otherOwner.id, name: 'oc', jwtTokenHash: 'h' },
    });
    const otherJwt = await new ClientJwtService().sign({
      clientId: otherClient.id,
      ownerId: otherOwner.id,
    });

    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone-status`)
      .set('authorization', `Bearer ${otherJwt}`)
      .send({ status: 'CLONING' });

    expect(res.status).toBe(403);
  });

  it('rejects missing bearer token with 401', async () => {
    const { project } = await seed();
    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone-status`)
      .send({ status: 'CLONING' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown status enum value with 400', async () => {
    const { project, jwt } = await seed();
    const res = await request(app.getHttpServer())
      .post(`/internal/projects/${project.id}/clone-status`)
      .set('authorization', `Bearer ${jwt}`)
      .send({ status: 'BOGUS' });
    expect(res.status).toBe(400);
  });
});

describe('POST /internal/clients/installation-tokens', () => {
  it('mints a token for an installation owned by the caller', async () => {
    const { jwt, installationId } = await seed();
    getInstallationToken.mockResolvedValue('ghs_freshtoken123');

    const res = await request(app.getHttpServer())
      .post('/internal/clients/installation-tokens')
      .set('authorization', `Bearer ${jwt}`)
      .send({ installationId });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ token: 'ghs_freshtoken123' });
    expect(getInstallationToken).toHaveBeenCalledWith(installationId);
  });

  it('rejects a request for an installation owned by another user with 403', async () => {
    const { jwt } = await seed({ installationId: 8001 });
    // Different owner with a different installation.
    const otherUser = await prisma.user.create({
      data: { githubId: 9004, login: 'o2', role: UserRole.OWNER },
    });
    const otherReg = await prisma.githubAppRegistration.create({
      data: {
        ownerId: otherUser.id,
        source: 'BYO',
        appId: 99999,
        webhookSecret: Buffer.from('s'),
        privateKeyPem: Buffer.from('p'),
      },
    });
    await prisma.githubInstallation.create({
      data: {
        registrationId: otherReg.id,
        installationId: 8002,
        accountLogin: 'o2',
        accountType: 'User',
        accountId: 2,
        permissions: {},
        events: [],
        repositorySelection: 'all',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/internal/clients/installation-tokens')
      .set('authorization', `Bearer ${jwt}`)
      .send({ installationId: 8002 });

    expect(res.status).toBe(403);
    expect(getInstallationToken).not.toHaveBeenCalled();
  });
});
