import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { HarnessesService } from '../../src/harnesses/harnesses.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // HarnessRun.harnessId is onDelete: Restrict, so any runs left behind by a
  // prior spec file (the suite runs serially against one shared Postgres)
  // would block harness.deleteMany. Clear the run chain first.
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.runPreset.deleteMany();
  await prisma.client.deleteMany();
  await prisma.project.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.user.deleteMany();
});

async function seedOwner(login = 'h-owner', githubId = 4000) {
  return prisma.user.create({
    data: { githubId, login, role: UserRole.OWNER },
  });
}

const sampleDefinition = {
  name: 'echo',
  version: 1,
  steps: [{ id: 's1', type: 'tool', use: 'fs.write' }],
};

describe('HarnessesService.create — versioned', () => {
  it('first save of a name is version 1', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    const row = await svc.create({
      ownerId: owner.id,
      name: 'echo',
      definition: sampleDefinition,
    });
    expect(row.name).toBe('echo');
    expect(row.version).toBe(1);
    expect(row.definition).toEqual(sampleDefinition);
  });

  it('saving the same name twice produces v1 + v2 (no error)', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    const v1 = await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    const v2 = await svc.create({
      ownerId: owner.id,
      name: 'echo',
      definition: { ...sampleDefinition, description: 'tweaked' },
    });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.id).not.toBe(v2.id);
  });

  it('saving the same name three times produces v1 / v2 / v3', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    const v3 = await svc.create({
      ownerId: owner.id,
      name: 'echo',
      definition: sampleDefinition,
    });
    expect(v3.version).toBe(3);
    const rows = await prisma.harness.findMany({
      where: { ownerId: owner.id, name: 'echo' },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
  });
});

describe('HarnessesService.listByOwner', () => {
  it('default returns only the latest version per (ownerId, name)', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await new Promise((r) => setTimeout(r, 5));
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await new Promise((r) => setTimeout(r, 5));
    await svc.create({ ownerId: owner.id, name: 'noop', definition: sampleDefinition });

    const list = await svc.listByOwner(owner.id);
    expect(list).toHaveLength(2);
    const echoRow = list.find((h) => h.name === 'echo');
    expect(echoRow?.version).toBe(2);
  });

  it('latestOnly:false returns every version row', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await svc.create({ ownerId: owner.id, name: 'noop', definition: sampleDefinition });

    const list = await svc.listByOwner(owner.id, { latestOnly: false });
    expect(list).toHaveLength(3);
  });

  it("returns only that owner's harnesses", async () => {
    const a = await seedOwner('h-a', 4001);
    const b = await seedOwner('h-b', 4002);
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: a.id, name: 'h1', definition: sampleDefinition });
    await svc.create({ ownerId: b.id, name: 'h2', definition: sampleDefinition });

    const aList = await svc.listByOwner(a.id);
    expect(aList).toHaveLength(1);
    expect(aList[0]?.name).toBe('h1');
  });
});

describe('HarnessesService.listVersionsByName', () => {
  it('returns every version of a single name, newest first', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });

    const list = await svc.listVersionsByName(owner.id, 'echo');
    expect(list.map((h) => h.version)).toEqual([3, 2, 1]);
  });

  it('returns [] for an unknown name', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    const list = await svc.listVersionsByName(owner.id, 'never');
    expect(list).toEqual([]);
  });
});

describe('HarnessesService.getLatestSibling', () => {
  it('returns the highest-version row for the same (ownerId, name)', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    const v1 = await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    const v2 = await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    const v3 = await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    expect(v1.id).not.toBe(v2.id);
    const latest = await svc.getLatestSibling(v1.id);
    expect(latest.id).toBe(v3.id);
    expect(latest.version).toBe(3);
  });
});

describe('HarnessesService.get', () => {
  it('throws NotFoundException for unknown id', async () => {
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await expect(svc.get('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });
});
