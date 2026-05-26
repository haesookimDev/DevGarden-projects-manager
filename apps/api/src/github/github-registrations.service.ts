import { Buffer } from 'node:buffer';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import type { GithubAppRegistration, GithubAppSource } from '@prisma/client';

import { decryptEnvelopeUtf8, encryptEnvelope } from '../crypto/envelope';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePrivateKey } from './github-app.service';

// Lazy factory so unit tests can inject a mock that doesn't perform a network
// call. Real callers pass `undefined` to get a fresh Octokit per invocation.
export type OctokitFactory = (opts: { appId: number; privateKey: string }) => Octokit;

export const OCTOKIT_FACTORY = Symbol('OCTOKIT_FACTORY');

export interface CreateByoInput {
  ownerId: string;
  appId: number;
  privateKeyPem: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
}

@Injectable()
export class GithubRegistrationsService {
  private readonly logger = new Logger(GithubRegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OCTOKIT_FACTORY) private readonly octokitFactory: OctokitFactory,
  ) {}

  /**
   * Validate the supplied App credentials against GitHub by calling
   * `apps.getAuthenticated`, then upsert a GithubAppRegistration row for the
   * owner (one row per owner — single-user MVP). Secrets land in the DB
   * envelope-encrypted; appId / appSlug / clientId / htmlUrl are plaintext.
   */
  async createByo(input: CreateByoInput): Promise<GithubAppRegistration> {
    const normalized = this.normalizePem(input.privateKeyPem);
    const octokit = this.octokitFactory({ appId: input.appId, privateKey: normalized });

    let appSlug: string | undefined;
    let htmlUrl: string | undefined;
    try {
      const res = await octokit.rest.apps.getAuthenticated();
      const data = res.data as { slug?: string | null; html_url?: string | null } | null;
      appSlug = data?.slug ?? undefined;
      htmlUrl = data?.html_url ?? undefined;
    } catch (err) {
      // Most failures here are credential mismatches (401 / 404). Surface a
      // crisp message rather than the raw octokit error so the onboarding
      // form can display it inline.
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status?: number }).status
          : undefined;
      this.logger.warn(
        `BYO credentials failed validation (status=${status ?? 'unknown'}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        'GitHub rejected these App credentials. Check that the App ID matches the private key.',
      );
    }

    const source: GithubAppSource = 'BYO';
    // Prisma's Bytes column expects Uint8Array<ArrayBuffer>; encryptEnvelope
    // returns Buffer<ArrayBufferLike>. They are byte-identical at runtime —
    // copy through new Uint8Array(...) at the boundary so the type matches
    // without a cast.
    const encryptedPem = toBytes(encryptEnvelope(normalized));
    const encryptedWebhook = toBytes(encryptEnvelope(input.webhookSecret ?? ''));
    const encryptedClientSecret = input.clientSecret
      ? toBytes(encryptEnvelope(input.clientSecret))
      : null;

    return this.prisma.githubAppRegistration.upsert({
      where: { ownerId: input.ownerId },
      create: {
        ownerId: input.ownerId,
        source,
        appId: input.appId,
        appSlug,
        webhookSecret: encryptedWebhook,
        privateKeyPem: encryptedPem,
        clientId: input.clientId,
        clientSecret: encryptedClientSecret,
        htmlUrl,
      },
      update: {
        source,
        appId: input.appId,
        appSlug,
        webhookSecret: encryptedWebhook,
        privateKeyPem: encryptedPem,
        clientId: input.clientId,
        clientSecret: encryptedClientSecret,
        htmlUrl,
      },
    });
  }

  /**
   * Persist the credentials returned by GitHub's manifest-conversion call.
   * Unlike createByo (which we validated client-side first), the manifest
   * payload is trusted — GitHub generated it for us 30 seconds ago.
   */
  async createFromManifest(input: {
    ownerId: string;
    appId: number;
    appSlug?: string | null;
    privateKeyPem: string;
    webhookSecret: string;
    clientId?: string | null;
    clientSecret?: string | null;
    htmlUrl?: string | null;
  }): Promise<GithubAppRegistration> {
    const source: GithubAppSource = 'MANIFEST';
    const encryptedPem = toBytes(encryptEnvelope(input.privateKeyPem));
    const encryptedWebhook = toBytes(encryptEnvelope(input.webhookSecret));
    const encryptedClientSecret = input.clientSecret
      ? toBytes(encryptEnvelope(input.clientSecret))
      : null;
    return this.prisma.githubAppRegistration.upsert({
      where: { ownerId: input.ownerId },
      create: {
        ownerId: input.ownerId,
        source,
        appId: input.appId,
        appSlug: input.appSlug ?? null,
        webhookSecret: encryptedWebhook,
        privateKeyPem: encryptedPem,
        clientId: input.clientId ?? null,
        clientSecret: encryptedClientSecret,
        htmlUrl: input.htmlUrl ?? null,
      },
      update: {
        source,
        appId: input.appId,
        appSlug: input.appSlug ?? null,
        webhookSecret: encryptedWebhook,
        privateKeyPem: encryptedPem,
        clientId: input.clientId ?? null,
        clientSecret: encryptedClientSecret,
        htmlUrl: input.htmlUrl ?? null,
      },
    });
  }

  async getByOwner(ownerId: string): Promise<GithubAppRegistration | null> {
    return this.prisma.githubAppRegistration.findUnique({ where: { ownerId } });
  }

  /**
   * Decrypt the Bytes columns of a registration row into their plaintext
   * forms. Callers (like GithubInstallationsService) need the appId +
   * privateKey to mint installation tokens via App JWT. Keep the surface
   * narrow — return only the fields a downstream caller may legitimately
   * need so we never accidentally expose the webhook secret elsewhere.
   */
  decryptAppCredentials(registration: GithubAppRegistration): {
    appId: number;
    privateKeyPem: string;
  } {
    return {
      appId: registration.appId,
      privateKeyPem: decryptEnvelopeUtf8(Buffer.from(registration.privateKeyPem)),
    };
  }

  private normalizePem(pem: string): string {
    // normalizePrivateKey is shared with the env-driven path and throws
    // InternalServerErrorException for unparseable input. For a user-facing
    // BYO endpoint we want a 400 — convert at the boundary.
    try {
      return normalizePrivateKey(pem);
    } catch {
      throw new BadRequestException(
        'privateKeyPem must be a PEM-formatted RSA or PKCS8 private key',
      );
    }
  }
}

function toBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  // Prisma's Bytes column on TS 5.7+ expects Uint8Array<ArrayBuffer>
  // specifically (not <ArrayBufferLike>), so allocate a fresh
  // ArrayBuffer-backed view at the boundary.
  const ab = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(ab);
  out.set(src);
  return out;
}

/** Project a registration row into the wire shape, dropping the encrypted
 *  Bytes columns so they never leak through the controller. */
export function projectRegistration(row: GithubAppRegistration): {
  id: string;
  ownerId: string;
  source: GithubAppSource;
  appId: number;
  appSlug: string | null;
  clientId: string | null;
  htmlUrl: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    ownerId: row.ownerId,
    source: row.source,
    appId: row.appId,
    appSlug: row.appSlug,
    clientId: row.clientId,
    htmlUrl: row.htmlUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
