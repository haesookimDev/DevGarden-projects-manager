import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PresetsService } from '../../src/projects/presets.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();

let counter = 0;
function nextId(): number {
  counter += 1;
  return 50_000 + counter;
}

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
  await prisma.runPreset.deleteMany();
  await prisma.githubEvent.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

interface Fixtures {
  ownerId: string;
  projectId: string;
  harnessId: string;
  clientId: string;
}

async function makeFixtures(): Promise<Fixtures> {
  const owner = await prisma.user.create({
    data: { githubId: nextId(), login: `p-${nextId()}`, role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: nextId(),
      repoFullName: 'preset/repo',
      localRoot: '/tmp/p',
    },
  });
  const harness = await prisma.harness.create({
    data: {
      ownerId: owner.id,
      name: `h-${nextId()}`,
      definition: { name: 'h', version: 1, steps: [] },
    },
  });
  const client = await prisma.client.create({
    data: { ownerId: owner.id, name: `c-${nextId()}`, jwtTokenHash: 'h' },
  });
  return { ownerId: owner.id, projectId: project.id, harnessId: harness.id, clientId: client.id };
}

describe('PresetsService.create', () => {
  it('creates a preset with default empty inputs', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    const preset = await svc.create({
      projectId: f.projectId,
      name: 'default',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    expect(preset.name).toBe('default');
    expect(preset.inputs).toEqual({});
    expect(preset.isDefault).toBe(false);
  });

  it('rejects a duplicate (projectId, name) with ConflictException', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    await svc.create({
      projectId: f.projectId,
      name: 'dup',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    await expect(
      svc.create({
        projectId: f.projectId,
        name: 'dup',
        harnessId: f.harnessId,
        clientId: f.clientId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a harness owned by another user', async () => {
    const f = await makeFixtures();
    const other = await prisma.user.create({
      data: { githubId: nextId(), login: 'other', role: UserRole.OWNER },
    });
    const otherHarness = await prisma.harness.create({
      data: { ownerId: other.id, name: 'oh', definition: { name: 'oh', version: 1, steps: [] } },
    });
    const svc = new PresetsService(prisma as unknown as PrismaService);
    await expect(
      svc.create({
        projectId: f.projectId,
        name: 'x',
        harnessId: otherHarness.id,
        clientId: f.clientId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('isDefault=true clears any existing default for the same project', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    const first = await svc.create({
      projectId: f.projectId,
      name: 'first',
      harnessId: f.harnessId,
      clientId: f.clientId,
      isDefault: true,
    });
    const second = await svc.create({
      projectId: f.projectId,
      name: 'second',
      harnessId: f.harnessId,
      clientId: f.clientId,
      isDefault: true,
    });
    const firstReloaded = await svc.getById(first.id);
    expect(firstReloaded.isDefault).toBe(false);
    expect(second.isDefault).toBe(true);
  });
});

describe('PresetsService.listByProject', () => {
  it('returns presets with the default one first, then by createdAt asc', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    await svc.create({
      projectId: f.projectId,
      name: 'a',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    await new Promise((r) => setTimeout(r, 5));
    await svc.create({
      projectId: f.projectId,
      name: 'b',
      harnessId: f.harnessId,
      clientId: f.clientId,
      isDefault: true,
    });
    await new Promise((r) => setTimeout(r, 5));
    await svc.create({
      projectId: f.projectId,
      name: 'c',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    const list = await svc.listByProject(f.projectId);
    expect(list.map((p) => p.name)).toEqual(['b', 'a', 'c']);
  });
});

describe('PresetsService.update', () => {
  it('partially updates name/inputs', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    const preset = await svc.create({
      projectId: f.projectId,
      name: 'orig',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    const updated = await svc.update(preset.id, {
      name: 'renamed',
      inputs: { branch: 'main' },
    });
    expect(updated.name).toBe('renamed');
    expect(updated.inputs).toEqual({ branch: 'main' });
  });

  it('promoting one preset to default demotes the previous default', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    const first = await svc.create({
      projectId: f.projectId,
      name: 'first',
      harnessId: f.harnessId,
      clientId: f.clientId,
      isDefault: true,
    });
    const second = await svc.create({
      projectId: f.projectId,
      name: 'second',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    const promoted = await svc.update(second.id, { isDefault: true });
    expect(promoted.isDefault).toBe(true);
    const reloaded = await svc.getById(first.id);
    expect(reloaded.isDefault).toBe(false);
  });

  it('throws NotFoundException for an unknown preset id', async () => {
    const svc = new PresetsService(prisma as unknown as PrismaService);
    await expect(svc.update('missing', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PresetsService.remove', () => {
  it('deletes a preset', async () => {
    const f = await makeFixtures();
    const svc = new PresetsService(prisma as unknown as PrismaService);
    const preset = await svc.create({
      projectId: f.projectId,
      name: 'go',
      harnessId: f.harnessId,
      clientId: f.clientId,
    });
    await svc.remove(preset.id);
    await expect(svc.getById(preset.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the preset does not exist', async () => {
    const svc = new PresetsService(prisma as unknown as PrismaService);
    await expect(svc.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
