import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';

import { decryptEnvelopeUtf8, resetEncryptionKeyCache } from '../crypto/envelope';
import type { PrismaService } from '../prisma/prisma.service';
import { GithubRegistrationsService, type OctokitFactory } from './github-registrations.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');

const PEM_OK =
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n';

type UpsertArgs = {
  where: { ownerId: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};
type FindUniqueArgs = { where: { ownerId: string } };

function makePrismaMock() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    githubAppRegistration: {
      upsert: vi.fn(async ({ where, create, update }: UpsertArgs) => {
        const existing = rows.get(where.ownerId);
        const merged = {
          id: existing?.id ?? `reg_${rows.size + 1}`,
          createdAt: existing?.createdAt ?? new Date(),
          updatedAt: new Date(),
          ...(existing ? update : create),
          ownerId: where.ownerId,
        };
        rows.set(where.ownerId, merged);
        return merged;
      }),
      findUnique: vi.fn(async ({ where }: FindUniqueArgs) => rows.get(where.ownerId) ?? null),
    },
    __rows: rows,
  };
}

function makeOctokitFactoryReturning(data: unknown): OctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          getAuthenticated: vi.fn().mockResolvedValue({ data }),
        },
      },
    }) as unknown as Octokit;
}

function makeOctokitFactoryRejecting(err: unknown): OctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          getAuthenticated: vi.fn().mockRejectedValue(err),
        },
      },
    }) as unknown as Octokit;
}

describe('GithubRegistrationsService.createByo', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    resetEncryptionKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
    resetEncryptionKeyCache();
  });

  it('validates credentials with octokit, then stores envelope-encrypted secrets', async () => {
    const prisma = makePrismaMock();
    const octokitFactory = makeOctokitFactoryReturning({
      slug: 'devgarden-test',
      html_url: 'https://github.com/apps/devgarden-test',
    });
    const svc = new GithubRegistrationsService(prisma as unknown as PrismaService, octokitFactory);

    const row = await svc.createByo({
      ownerId: 'user_1',
      appId: 12345,
      privateKeyPem: PEM_OK,
      webhookSecret: 'wh-secret',
    });

    expect(row.appId).toBe(12345);
    expect(row.source).toBe('BYO');
    expect(row.appSlug).toBe('devgarden-test');
    expect(row.htmlUrl).toBe('https://github.com/apps/devgarden-test');
    expect(prisma.githubAppRegistration.upsert).toHaveBeenCalledTimes(1);

    // Secrets are envelope-encrypted, not plaintext.
    const stored = prisma.__rows.get('user_1') as {
      privateKeyPem: Uint8Array;
      webhookSecret: Uint8Array;
    };
    // normalizePrivateKey trims the trailing newline; the decrypted value
    // should match the normalized form, not the raw input.
    expect(decryptEnvelopeUtf8(Buffer.from(stored.privateKeyPem))).toBe(PEM_OK.trim());
    expect(decryptEnvelopeUtf8(Buffer.from(stored.webhookSecret))).toBe('wh-secret');
  });

  it('encrypts an empty string when webhookSecret is omitted (column is non-null)', async () => {
    const prisma = makePrismaMock();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      makeOctokitFactoryReturning({ slug: 'x', html_url: null }),
    );
    await svc.createByo({ ownerId: 'user_1', appId: 1, privateKeyPem: PEM_OK });
    const stored = prisma.__rows.get('user_1') as { webhookSecret: Uint8Array };
    expect(decryptEnvelopeUtf8(Buffer.from(stored.webhookSecret))).toBe('');
  });

  it('stores clientSecret only when provided', async () => {
    const prisma = makePrismaMock();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      makeOctokitFactoryReturning({ slug: 'x', html_url: null }),
    );

    await svc.createByo({
      ownerId: 'user_1',
      appId: 1,
      privateKeyPem: PEM_OK,
      clientId: 'Iv1.abc',
      clientSecret: 'cs-1',
    });
    const stored1 = prisma.__rows.get('user_1') as {
      clientId: string | null;
      clientSecret: Uint8Array | null;
    };
    expect(stored1.clientId).toBe('Iv1.abc');
    expect(stored1.clientSecret).not.toBeNull();
    expect(decryptEnvelopeUtf8(Buffer.from(stored1.clientSecret!))).toBe('cs-1');

    await svc.createByo({ ownerId: 'user_2', appId: 2, privateKeyPem: PEM_OK });
    const stored2 = prisma.__rows.get('user_2') as { clientSecret: Uint8Array | null };
    expect(stored2.clientSecret).toBeNull();
  });

  it('upserts: second call for the same owner updates the same row', async () => {
    const prisma = makePrismaMock();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      makeOctokitFactoryReturning({ slug: 'x', html_url: null }),
    );
    await svc.createByo({ ownerId: 'user_1', appId: 1, privateKeyPem: PEM_OK });
    await svc.createByo({ ownerId: 'user_1', appId: 2, privateKeyPem: PEM_OK });

    expect(prisma.githubAppRegistration.upsert).toHaveBeenCalledTimes(2);
    const row = prisma.__rows.get('user_1') as { appId: number };
    expect(row.appId).toBe(2);
    expect(prisma.__rows.size).toBe(1);
  });

  it('rejects credentials when octokit getAuthenticated fails (401/404 etc.)', async () => {
    const prisma = makePrismaMock();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      makeOctokitFactoryRejecting(Object.assign(new Error('Bad credentials'), { status: 401 })),
    );
    await expect(
      svc.createByo({ ownerId: 'user_1', appId: 1, privateKeyPem: PEM_OK }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.githubAppRegistration.upsert).not.toHaveBeenCalled();
  });

  it('rejects a privateKeyPem that lacks the PEM header', async () => {
    const prisma = makePrismaMock();
    const svc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      makeOctokitFactoryReturning({ slug: 'x', html_url: null }),
    );
    await expect(
      svc.createByo({ ownerId: 'user_1', appId: 1, privateKeyPem: 'not-a-pem' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
