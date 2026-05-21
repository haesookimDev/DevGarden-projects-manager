import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { ClientJwtService } from '../../src/clients/client-jwt.service';
import { ClientsService } from '../../src/clients/clients.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
  process.env.AUTH_SECRET = 'integration-test-secret-with-enough-length-please';
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.client.deleteMany();
  await prisma.clientPairing.deleteMany();
  await prisma.user.deleteMany();
});

function makeService() {
  const jwtSvc = new ClientJwtService();
  return new ClientsService(prisma as unknown as PrismaService, jwtSvc);
}

describe('ClientsService — issuePairingToken', () => {
  it('creates a ClientPairing row and returns a plaintext token + expiry', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 1, login: 'a', role: UserRole.OWNER },
    });
    const svc = makeService();

    const result = await svc.issuePairingToken({ ownerId: owner.id, clientName: 'My Laptop' });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const rows = await prisma.clientPairing.findMany({ where: { ownerId: owner.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(result.token); // stored as bcrypt hash
    expect(rows[0]?.clientName).toBe('My Laptop');
  });

  it('throws NotFoundException for unknown owner', async () => {
    const svc = makeService();
    await expect(
      svc.issuePairingToken({ ownerId: 'nonexistent', clientName: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClientsService — consumePairingToken', () => {
  it('creates Client + signs a JWT + marks pairing consumed', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 2, login: 'b', role: UserRole.OWNER },
    });
    const svc = makeService();
    const { token } = await svc.issuePairingToken({
      ownerId: owner.id,
      clientName: 'Workstation',
    });

    const { client, jwt } = await svc.consumePairingToken({
      token,
      hostname: 'machine-1',
      os: 'darwin',
    });

    expect(client.name).toBe('Workstation');
    expect(client.hostname).toBe('machine-1');
    expect(jwt.split('.')).toHaveLength(3);

    const pairing = await prisma.clientPairing.findFirst({ where: { ownerId: owner.id } });
    expect(pairing?.consumedAt).not.toBeNull();

    const jwtSvc = new ClientJwtService();
    const payload = await jwtSvc.verify(jwt);
    expect(payload.clientId).toBe(client.id);
    expect(payload.ownerId).toBe(owner.id);
  });

  it('rejects when token is wrong', async () => {
    await prisma.user.create({
      data: { id: 'owner-x', githubId: 3, login: 'c', role: UserRole.OWNER },
    });
    const svc = makeService();
    await svc.issuePairingToken({ ownerId: 'owner-x', clientName: 'C' });

    await expect(
      svc.consumePairingToken({ token: 'definitely-not-the-real-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that has already been consumed', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 4, login: 'd', role: UserRole.OWNER },
    });
    const svc = makeService();
    const { token } = await svc.issuePairingToken({ ownerId: owner.id, clientName: 'D' });

    await svc.consumePairingToken({ token });
    await expect(svc.consumePairingToken({ token })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 5, login: 'e', role: UserRole.OWNER },
    });
    const svc = makeService();
    const past = new Date(Date.now() - 60_000);
    const { token } = await svc.issuePairingToken(
      { ownerId: owner.id, clientName: 'E' },
      // Pretend issuance happened 11 minutes ago so the row is already expired.
      new Date(past.getTime() - 11 * 60 * 1000),
    );

    await expect(svc.consumePairingToken({ token })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
