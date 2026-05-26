import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptEnvelopeUtf8, resetEncryptionKeyCache } from '../crypto/envelope';
import type { PrismaService } from '../prisma/prisma.service';
import { GithubManifestService } from './github-manifest.service';
import { GithubRegistrationsService, type OctokitFactory } from './github-registrations.service';
import { ManifestStateService } from './manifest-state.service';

const TEST_KEY_B64 = randomBytes(32).toString('base64');

type UpsertArgs = {
  where: { ownerId: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

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
    },
    __rows: rows,
  };
}

function octokitReturningConversion(data: unknown): OctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          createFromManifest: vi.fn().mockResolvedValue({ data }),
        },
      },
    }) as unknown as Octokit;
}

function octokitRejectingConversion(err: unknown): OctokitFactory {
  return () =>
    ({
      rest: {
        apps: {
          createFromManifest: vi.fn().mockRejectedValue(err),
        },
      },
    }) as unknown as Octokit;
}

describe('GithubManifestService', () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  const originalBase = process.env.PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    process.env.PUBLIC_BASE_URL = 'https://example.com';
    resetEncryptionKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
    if (originalBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalBase;
    resetEncryptionKeyCache();
  });

  function makeSvc(opts: {
    octokit: OctokitFactory;
    prismaMock?: ReturnType<typeof makePrismaMock>;
  }) {
    const prismaMock = opts.prismaMock ?? makePrismaMock();
    const stateSvc = new ManifestStateService();
    const regSvc = new GithubRegistrationsService(
      prismaMock as unknown as PrismaService,
      opts.octokit,
    );
    const manifestSvc = new GithubManifestService(stateSvc, regSvc, opts.octokit);
    return { manifestSvc, stateSvc, prismaMock };
  }

  it('start returns a state token, manifest body, and a GitHub submit URL', () => {
    const { manifestSvc, stateSvc } = makeSvc({
      octokit: octokitReturningConversion({}),
    });
    const out = manifestSvc.start('user_1');

    expect(out.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.submitUrl).toBe(
      `https://github.com/settings/apps/new?state=${encodeURIComponent(out.state)}`,
    );
    expect(out.manifest.url).toBe('https://example.com');
    expect(out.manifest.redirect_url).toBe('https://example.com/webhooks/github/manifest-callback');
    expect(out.manifest.default_permissions.contents).toBe('write');

    // State must be issued — consume should succeed once.
    expect(stateSvc.consume(out.state)).toBe('user_1');
  });

  it('start throws BadRequest when PUBLIC_BASE_URL is missing', () => {
    delete process.env.PUBLIC_BASE_URL;
    const { manifestSvc } = makeSvc({ octokit: octokitReturningConversion({}) });
    expect(() => manifestSvc.start('user_1')).toThrow(BadRequestException);
  });

  it('complete exchanges the code, persists the row with envelope-encrypted secrets', async () => {
    const { manifestSvc, prismaMock } = makeSvc({
      octokit: octokitReturningConversion({
        id: 4242,
        slug: 'devgarden-test',
        client_id: 'Iv1.abc',
        client_secret: 'cs-1',
        webhook_secret: 'wh-1',
        pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n',
        html_url: 'https://github.com/apps/devgarden-test',
      }),
    });
    const { state } = manifestSvc.start('user_1');
    const row = await manifestSvc.complete('manifest-code-xyz', state);

    expect(row.appId).toBe(4242);
    expect(row.source).toBe('MANIFEST');
    expect(row.appSlug).toBe('devgarden-test');
    expect(row.htmlUrl).toBe('https://github.com/apps/devgarden-test');
    expect(prismaMock.githubAppRegistration.upsert).toHaveBeenCalledTimes(1);

    const stored = prismaMock.__rows.get('user_1') as {
      privateKeyPem: Uint8Array;
      webhookSecret: Uint8Array;
      clientSecret: Uint8Array | null;
    };
    expect(decryptEnvelopeUtf8(Buffer.from(stored.privateKeyPem))).toContain('PRIVATE KEY');
    expect(decryptEnvelopeUtf8(Buffer.from(stored.webhookSecret))).toBe('wh-1');
    expect(decryptEnvelopeUtf8(Buffer.from(stored.clientSecret!))).toBe('cs-1');
  });

  it('complete throws when the state was never issued (or already consumed)', async () => {
    const { manifestSvc } = makeSvc({ octokit: octokitReturningConversion({}) });
    await expect(manifestSvc.complete('code', 'bogus-state')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('complete throws when octokit rejects the conversion code', async () => {
    const { manifestSvc } = makeSvc({
      octokit: octokitRejectingConversion(Object.assign(new Error('bad code'), { status: 400 })),
    });
    const { state } = manifestSvc.start('user_1');
    await expect(manifestSvc.complete('bad-code', state)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('complete throws when GitHub returns an incomplete payload (missing pem/webhook)', async () => {
    const { manifestSvc } = makeSvc({
      octokit: octokitReturningConversion({ id: 1, pem: 'no-webhook-secret' }),
    });
    const { state } = manifestSvc.start('user_1');
    await expect(manifestSvc.complete('code', state)).rejects.toBeInstanceOf(BadRequestException);
  });
});
