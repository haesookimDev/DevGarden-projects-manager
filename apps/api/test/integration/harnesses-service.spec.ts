import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('HarnessesService', () => {
  it('creates a harness and assigns version 1', async () => {
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

  it('rejects duplicate (ownerId, name) with ConflictException', async () => {
    const owner = await seedOwner();
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition });
    await expect(
      svc.create({ ownerId: owner.id, name: 'echo', definition: sampleDefinition }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('listByOwner returns only that owners harnesses, newest first', async () => {
    const a = await seedOwner('h-a', 4001);
    const b = await seedOwner('h-b', 4002);
    const svc = new HarnessesService(prisma as unknown as PrismaService);

    await svc.create({ ownerId: a.id, name: 'h1', definition: sampleDefinition });
    await new Promise((r) => setTimeout(r, 5));
    await svc.create({ ownerId: a.id, name: 'h2', definition: sampleDefinition });
    await svc.create({ ownerId: b.id, name: 'h3', definition: sampleDefinition });

    const list = await svc.listByOwner(a.id);
    expect(list.map((h) => h.name)).toEqual(['h2', 'h1']);
  });

  it('get throws NotFoundException for unknown id', async () => {
    const svc = new HarnessesService(prisma as unknown as PrismaService);
    await expect(svc.get('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });
});
