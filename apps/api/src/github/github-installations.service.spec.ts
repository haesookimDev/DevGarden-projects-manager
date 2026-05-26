import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import type { GithubAppRegistration, GithubInstallation } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encryptEnvelope, resetEncryptionKeyCache } from '../crypto/envelope';
import type { PrismaService } from '../prisma/prisma.service';
import {
  GithubInstallationsService,
  type UserOctokitFactory,
} from './github-installations.service';
import { GithubRegistrationsService } from './github-registrations.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');
const REG_OWNER_ID = 'user_1';
const REG_ID = 'reg_1';
const APP_ID = 9999;

function toBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  // Prisma's Bytes column expects Uint8Array<ArrayBuffer> on TS 5.7+; convert
  // the Buffer the envelope helper returns.
  const ab = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(ab);
  out.set(src);
  return out;
}

function makeRegistration(): GithubAppRegistration {
  // Re-use the live envelope encryption helper so decryptAppCredentials works
  // without further mocking.
  const pem = Buffer.from(
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----',
    'utf8',
  );
  return {
    id: REG_ID,
    ownerId: REG_OWNER_ID,
    source: 'BYO',
    appId: APP_ID,
    appSlug: 'devgarden-test',
    webhookSecret: toBytes(encryptEnvelope('wh')),
    privateKeyPem: toBytes(encryptEnvelope(pem)),
    clientId: null,
    clientSecret: null,
    htmlUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

type InstallationUpsertArgs = {
  where: { installationId: number };
  create: Omit<GithubInstallation, 'id' | 'syncedAt'> & { syncedAt?: Date };
  update: Partial<Omit<GithubInstallation, 'id'>>;
};

function makePrismaMock(initialInstallations: GithubInstallation[] = []) {
  const installations = new Map<number, GithubInstallation>();
  for (const i of initialInstallations) installations.set(i.installationId, i);

  return {
    githubInstallation: {
      upsert: vi.fn(async ({ where, create, update }: InstallationUpsertArgs) => {
        const existing = installations.get(where.installationId);
        const base = (existing ?? create) as GithubInstallation;
        const next: GithubInstallation = {
          ...base,
          ...(existing ? (update as Partial<GithubInstallation>) : {}),
          id: existing?.id ?? `inst_${installations.size + 1}`,
          installationId: where.installationId,
          syncedAt: new Date(),
        };
        installations.set(where.installationId, next);
        return next;
      }),
      findMany: vi.fn(async () => Array.from(installations.values())),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => undefined),
    },
    __installations: installations,
  };
}

function userOctokitReturning(installations: Array<Record<string, unknown>>): UserOctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          listInstallationsForAuthenticatedUser: vi.fn().mockResolvedValue({
            data: { installations },
          }),
        },
      },
    }) as unknown as Octokit;
}

function userOctokitRejecting(err: unknown): UserOctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          listInstallationsForAuthenticatedUser: vi.fn().mockRejectedValue(err),
        },
      },
    }) as unknown as Octokit;
}

describe('GithubInstallationsService.listForUser', () => {
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

  function makeSvc(opts: {
    registration: GithubAppRegistration | null;
    userOctokit: UserOctokitFactory;
    prismaMock?: ReturnType<typeof makePrismaMock>;
  }) {
    const prismaMock = opts.prismaMock ?? makePrismaMock();
    const regSvc = {
      getByOwner: vi.fn(async () => opts.registration),
      decryptAppCredentials: new GithubRegistrationsService(
        prismaMock as unknown as PrismaService,
        () => ({}) as Octokit,
      ).decryptAppCredentials,
    } as unknown as GithubRegistrationsService;
    return new GithubInstallationsService(
      prismaMock as unknown as PrismaService,
      regSvc,
      opts.userOctokit,
    );
  }

  it('upserts only installations whose app_id matches our registration', async () => {
    const reg = makeRegistration();
    const prismaMock = makePrismaMock();
    const svc = makeSvc({
      registration: reg,
      prismaMock,
      userOctokit: userOctokitReturning([
        {
          id: 1,
          app_id: APP_ID,
          account: { login: 'octo', type: 'User', id: 100 },
          html_url: 'https://github.com/installations/1',
          permissions: { contents: 'write' },
          events: ['pull_request'],
          repository_selection: 'all',
        },
        {
          id: 2,
          app_id: 7777, // unrelated App
          account: { login: 'other', type: 'User', id: 200 },
        },
        {
          id: 3,
          app_id: APP_ID,
          account: { login: 'sample-org', type: 'Organization', id: 300 },
          permissions: { metadata: 'read' },
          events: [],
          repository_selection: 'selected',
        },
      ]),
    });

    const out = await svc.listForUser({ ownerId: REG_OWNER_ID, userOauthToken: 'gho_xxx' });

    expect(out).toHaveLength(2);
    expect(out.map((i) => i.installationId).sort()).toEqual([1, 3]);
    expect(prismaMock.githubInstallation.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.__installations.size).toBe(2);
  });

  it('throws NotFound when the owner has no registration yet', async () => {
    const svc = makeSvc({
      registration: null,
      userOctokit: userOctokitReturning([]),
    });
    await expect(
      svc.listForUser({ ownerId: REG_OWNER_ID, userOauthToken: 'gho_x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('translates an octokit rejection to BadRequest (bad/expired user token)', async () => {
    const svc = makeSvc({
      registration: makeRegistration(),
      userOctokit: userOctokitRejecting(
        Object.assign(new Error('Bad credentials'), { status: 401 }),
      ),
    });
    await expect(
      svc.listForUser({ ownerId: REG_OWNER_ID, userOauthToken: 'gho_x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
