// Integration coverage for the manifest flow against a real Testcontainers
// postgres. We exercise the full start → complete cycle but stub the octokit
// factory so no real GitHub call is made; the real value here is verifying
// that the persisted row + envelope round-trip work end-to-end.

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';

import { decryptEnvelopeUtf8, resetEncryptionKeyCache } from '../../src/crypto/envelope';
import { GithubManifestService } from '../../src/github/github-manifest.service';
import {
  GithubRegistrationsService,
  type OctokitFactory,
} from '../../src/github/github-registrations.service';
import { ManifestStateService } from '../../src/github/manifest-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');

const prisma = new PrismaClient();

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n';

const fakeOctokit =
  (
    data: {
      id: number;
      slug?: string;
      pem?: string;
      webhook_secret?: string;
      client_id?: string;
      client_secret?: string;
      html_url?: string;
    } | null,
  ): OctokitFactory =>
  () =>
    ({
      rest: {
        apps: {
          createFromManifest: async () => ({ data }),
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
const originalBase = process.env.PUBLIC_BASE_URL;

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = TEST_KEY_B64;
  process.env.PUBLIC_BASE_URL = 'https://devgarden-test.example.com';
  resetEncryptionKeyCache();
  await prisma.githubAppRegistration.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
  if (originalBase === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalBase;
  resetEncryptionKeyCache();
});

async function seedOwner(login = 'm-owner', githubId = 9200) {
  return prisma.user.create({
    data: { githubId, login, role: UserRole.OWNER },
  });
}

function build(octokit: OctokitFactory) {
  const stateSvc = new ManifestStateService();
  const regSvc = new GithubRegistrationsService(prisma as unknown as PrismaService, octokit);
  return {
    stateSvc,
    regSvc,
    manifestSvc: new GithubManifestService(stateSvc, regSvc, octokit),
  };
}

describe('GithubManifestService — integration', () => {
  it('complete writes a MANIFEST row + secrets decrypt to the GitHub-returned values', async () => {
    const owner = await seedOwner();
    const { manifestSvc } = build(
      fakeOctokit({
        id: 7777,
        slug: 'devgarden-it',
        pem: PEM,
        webhook_secret: 'wh-it',
        client_id: 'Iv1.it',
        client_secret: 'cs-it',
        html_url: 'https://github.com/apps/devgarden-it',
      }),
    );
    const { state } = manifestSvc.start(owner.id);
    const row = await manifestSvc.complete('code-1', state);

    expect(row.source).toBe('MANIFEST');
    expect(row.appId).toBe(7777);
    expect(row.appSlug).toBe('devgarden-it');

    const reloaded = await prisma.githubAppRegistration.findUnique({
      where: { ownerId: owner.id },
    });
    expect(reloaded).not.toBeNull();
    expect(decryptEnvelopeUtf8(Buffer.from(reloaded!.privateKeyPem))).toBe(PEM);
    expect(decryptEnvelopeUtf8(Buffer.from(reloaded!.webhookSecret))).toBe('wh-it');
    expect(decryptEnvelopeUtf8(Buffer.from(reloaded!.clientSecret!))).toBe('cs-it');
  });

  it('a second complete with the same state is rejected (single-use)', async () => {
    const owner = await seedOwner();
    const { manifestSvc } = build(fakeOctokit({ id: 1, pem: PEM, webhook_secret: 'wh' }));
    const { state } = manifestSvc.start(owner.id);
    await manifestSvc.complete('code-1', state);
    await expect(manifestSvc.complete('code-2', state)).rejects.toBeInstanceOf(BadRequestException);
  });
});
