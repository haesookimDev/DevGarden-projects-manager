// Integration coverage for the installations service against the
// Testcontainers postgres. We focus on:
//   - listForUser writes rows that survive a re-read via listFromDb
//   - re-running listForUser with the same payload upserts (no duplicate rows)
// We mock the user-OAuth Octokit factory so no real GitHub call is made.

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { PrismaClient, UserRole } from '@prisma/client';

import { resetEncryptionKeyCache } from '../../src/crypto/envelope';
import {
  GithubInstallationsService,
  type UserOctokitFactory,
} from '../../src/github/github-installations.service';
import {
  GithubRegistrationsService,
  type OctokitFactory,
} from '../../src/github/github-registrations.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n';
const APP_ID = 12345;

const prisma = new PrismaClient();

const validatingOctokit: OctokitFactory = () =>
  ({
    rest: {
      apps: {
        getAuthenticated: async () => ({ data: { slug: 'devgarden-it', html_url: null } }),
      },
    },
  }) as never;

function userOctokitWith(installations: Array<Record<string, unknown>>): UserOctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          listInstallationsForAuthenticatedUser: async () => ({
            data: { installations },
          }),
        },
      },
    }) as unknown as Octokit;
}

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
  await prisma.githubInstallation.deleteMany();
  await prisma.githubAppRegistration.deleteMany();
  await prisma.user.deleteMany();
});
afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
  resetEncryptionKeyCache();
});

async function seedOwnerWithRegistration() {
  const owner = await prisma.user.create({
    data: { githubId: 9300, login: 'inst-owner', role: UserRole.OWNER },
  });
  const regSvc = new GithubRegistrationsService(
    prisma as unknown as PrismaService,
    validatingOctokit,
  );
  await regSvc.createByo({
    ownerId: owner.id,
    appId: APP_ID,
    privateKeyPem: PEM,
  });
  return { owner, regSvc };
}

describe('GithubInstallationsService — integration', () => {
  it('listForUser upserts matching installations + listFromDb reads them back', async () => {
    const { owner, regSvc } = await seedOwnerWithRegistration();
    const svc = new GithubInstallationsService(
      prisma as unknown as PrismaService,
      regSvc,
      userOctokitWith([
        {
          id: 1001,
          app_id: APP_ID,
          account: { login: 'me', type: 'User', id: 7001 },
          html_url: 'https://github.com/installations/1001',
          permissions: { contents: 'write' },
          events: ['pull_request'],
          repository_selection: 'all',
        },
        {
          id: 2002,
          app_id: 99999, // unrelated App, should be filtered
          account: { login: 'somebody', type: 'User', id: 7002 },
        },
      ]),
    );

    const listed = await svc.listForUser({ ownerId: owner.id, userOauthToken: 'gho_x' });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.installationId).toBe(1001);

    const fromDb = await svc.listFromDb(owner.id);
    expect(fromDb).toHaveLength(1);
    expect(fromDb[0]!.accountLogin).toBe('me');
    expect(fromDb[0]!.permissions.contents).toBe('write');

    // Second sync with overlapping ids upserts in place (no duplicate rows).
    await svc.listForUser({
      ownerId: owner.id,
      userOauthToken: 'gho_x',
    });
    const rows = await prisma.githubInstallation.findMany();
    expect(rows).toHaveLength(1);
  });

  it('listFromDb returns empty array when owner has no registration', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 9304, login: 'no-reg', role: UserRole.OWNER },
    });
    const regSvc = new GithubRegistrationsService(
      prisma as unknown as PrismaService,
      validatingOctokit,
    );
    const svc = new GithubInstallationsService(
      prisma as unknown as PrismaService,
      regSvc,
      userOctokitWith([]),
    );
    const rows = await svc.listFromDb(owner.id);
    expect(rows).toEqual([]);
  });
});

// Silence Buffer-import lint warnings in the import block.
void Buffer;
