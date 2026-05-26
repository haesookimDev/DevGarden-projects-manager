// Integration coverage for GithubRegistrationsService against a real
// Testcontainers postgres. Verifies the prisma upsert + envelope encryption
// round-trip end-to-end: a write hits the DB, a read brings it back, and the
// stored Bytes columns decrypt to the original utf-8.

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';

import { decryptEnvelopeUtf8, resetEncryptionKeyCache } from '../../src/crypto/envelope';
import {
  GithubRegistrationsService,
  type OctokitFactory,
} from '../../src/github/github-registrations.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');
const PEM_OK =
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n';

const prisma = new PrismaClient();

const fakeOctokit =
  (data: { slug?: string | null; html_url?: string | null }): OctokitFactory =>
  () =>
    ({
      rest: {
        apps: {
          getAuthenticated: async () => ({ data }),
        },
      },
    }) as never;

const failingOctokit: OctokitFactory = () =>
  ({
    rest: {
      apps: {
        getAuthenticated: async () => {
          throw Object.assign(new Error('Bad credentials'), { status: 401 });
        },
      },
    },
  }) as never;

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const originalKey = process.env.ENCRYPTION_KEY;

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = TEST_KEY_B64;
  resetEncryptionKeyCache();
  await prisma.githubAppRegistration.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
  resetEncryptionKeyCache();
});

async function seedOwner(login = 'gh-owner', githubId = 9100) {
  return prisma.user.create({
    data: { githubId, login, role: UserRole.OWNER },
  });
}

describe('GithubRegistrationsService — integration', () => {
  it('createByo persists + getByOwner returns the same row, secrets decryptable', async () => {
    const owner = await seedOwner();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      fakeOctokit({ slug: 'devgarden', html_url: 'https://github.com/apps/devgarden' }),
    );

    const created = await svc.createByo({
      ownerId: owner.id,
      appId: 555,
      privateKeyPem: PEM_OK,
      webhookSecret: 'hook-1',
      clientId: 'Iv1.abc',
      clientSecret: 'cs-1',
    });

    expect(created.appId).toBe(555);
    expect(created.source).toBe('BYO');
    expect(created.appSlug).toBe('devgarden');

    const fetched = await svc.getByOwner(owner.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(decryptEnvelopeUtf8(Buffer.from(fetched!.privateKeyPem))).toBe(PEM_OK.trim());
    expect(decryptEnvelopeUtf8(Buffer.from(fetched!.webhookSecret))).toBe('hook-1');
    expect(decryptEnvelopeUtf8(Buffer.from(fetched!.clientSecret!))).toBe('cs-1');
  });

  it('createByo upserts on second call for the same owner', async () => {
    const owner = await seedOwner();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      fakeOctokit({ slug: 's1', html_url: null }),
    );

    const first = await svc.createByo({
      ownerId: owner.id,
      appId: 111,
      privateKeyPem: PEM_OK,
    });
    const second = await svc.createByo({
      ownerId: owner.id,
      appId: 222,
      privateKeyPem: PEM_OK,
    });
    expect(second.id).toBe(first.id);
    expect(second.appId).toBe(222);

    const rows = await prisma.githubAppRegistration.findMany({ where: { ownerId: owner.id } });
    expect(rows).toHaveLength(1);
  });

  it('createByo throws BadRequest and writes nothing when octokit rejects', async () => {
    const owner = await seedOwner();
    const svc = new GithubRegistrationsService(prisma as unknown as PrismaService, failingOctokit);

    await expect(
      svc.createByo({ ownerId: owner.id, appId: 1, privateKeyPem: PEM_OK }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const rows = await prisma.githubAppRegistration.findMany({ where: { ownerId: owner.id } });
    expect(rows).toHaveLength(0);
  });
});
