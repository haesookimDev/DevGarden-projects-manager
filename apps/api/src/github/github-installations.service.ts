import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { GithubInstallation } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GithubRegistrationsService } from './github-registrations.service';

// Test seam — DI token for the user-OAuth Octokit factory. The default impl
// just constructs `new Octokit({ auth: userToken })`; unit tests inject a
// mock so no network call escapes the suite.
export const USER_OCTOKIT_FACTORY = Symbol('USER_OCTOKIT_FACTORY');
export type UserOctokitFactory = (userToken: string) => Octokit;

// Sentinel return shapes — keep them stable; the controller passes them
// straight through to the BFF.
export interface InstallationRow {
  id: string;
  registrationId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountId: number;
  htmlUrl: string | null;
  permissions: Record<string, string>;
  events: string[];
  repositorySelection: string;
  syncedAt: string;
}

export interface RepoRow {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  fork: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
}

@Injectable()
export class GithubInstallationsService {
  private readonly logger = new Logger(GithubInstallationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registrations: GithubRegistrationsService,
    @Inject(USER_OCTOKIT_FACTORY) private readonly userOctokit: UserOctokitFactory,
  ) {}

  /**
   * Use the signed-in user's GitHub OAuth token to enumerate App
   * installations they can see, filter to ones for *our* App, and upsert
   * each into the DB. Returns the synced rows.
   */
  async listForUser(input: {
    ownerId: string;
    userOauthToken: string;
  }): Promise<InstallationRow[]> {
    const registration = await this.registrations.getByOwner(input.ownerId);
    if (!registration) {
      throw new NotFoundException(
        'No GitHub App is registered for this owner yet. Complete onboarding first.',
      );
    }
    const octokit = this.userOctokit(input.userOauthToken);
    let installations: ReturnedInstallation[];
    try {
      const res = await octokit.rest.apps.listInstallationsForAuthenticatedUser();
      installations = (res.data?.installations ?? []) as ReturnedInstallation[];
    } catch (err) {
      this.logger.warn(
        `listInstallationsForAuthenticatedUser failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        'GitHub rejected the user OAuth token. Re-authenticate and try again.',
      );
    }
    // Only the installs of *this* App belong to us. A user may have other
    // GitHub Apps installed; filter them out.
    const matching = installations.filter((inst) => inst.app_id === registration.appId);

    const upserted: GithubInstallation[] = [];
    for (const inst of matching) {
      const row = await this.prisma.githubInstallation.upsert({
        where: { installationId: inst.id },
        create: {
          registrationId: registration.id,
          installationId: inst.id,
          accountLogin: inst.account?.login ?? '',
          accountType: inst.account?.type ?? '',
          accountId: inst.account?.id ?? 0,
          htmlUrl: inst.html_url ?? null,
          permissions: (inst.permissions ?? {}) as object,
          events: inst.events ?? [],
          repositorySelection: inst.repository_selection ?? 'selected',
        },
        update: {
          registrationId: registration.id,
          accountLogin: inst.account?.login ?? '',
          accountType: inst.account?.type ?? '',
          accountId: inst.account?.id ?? 0,
          htmlUrl: inst.html_url ?? null,
          permissions: (inst.permissions ?? {}) as object,
          events: inst.events ?? [],
          repositorySelection: inst.repository_selection ?? 'selected',
          syncedAt: new Date(),
        },
      });
      upserted.push(row);
    }
    return upserted.map(projectInstallation);
  }

  async listFromDb(ownerId: string): Promise<InstallationRow[]> {
    const registration = await this.registrations.getByOwner(ownerId);
    if (!registration) return [];
    const rows = await this.prisma.githubInstallation.findMany({
      where: { registrationId: registration.id },
      orderBy: { accountLogin: 'asc' },
    });
    return rows.map(projectInstallation);
  }

  /**
   * Refresh a single installation's metadata using the App JWT (no user
   * OAuth needed). Useful for "the permissions seem stale" buttons in the
   * settings UI.
   */
  async syncOne(installationDbId: string): Promise<InstallationRow> {
    const inst = await this.prisma.githubInstallation.findUnique({
      where: { id: installationDbId },
      include: { registration: true },
    });
    if (!inst) throw new NotFoundException(`No installation ${installationDbId}`);

    const octokit = this.appOctokitFor(inst.registration);
    const res = await octokit.rest.apps.getInstallation({ installation_id: inst.installationId });
    const data = res.data as unknown as ReturnedInstallation;

    const updated = await this.prisma.githubInstallation.update({
      where: { id: installationDbId },
      data: {
        accountLogin: data.account?.login ?? inst.accountLogin,
        accountType: data.account?.type ?? inst.accountType,
        accountId: data.account?.id ?? inst.accountId,
        htmlUrl: data.html_url ?? inst.htmlUrl,
        permissions: (data.permissions ?? {}) as object,
        events: data.events ?? [],
        repositorySelection: data.repository_selection ?? inst.repositorySelection,
        syncedAt: new Date(),
      },
    });
    return projectInstallation(updated);
  }

  /**
   * List repos accessible to the installation via App JWT (no user OAuth).
   * Supports a simple substring search on `full_name` + a `type` filter:
   *   - "all"           (default) — every repo
   *   - "sources"       — excludes forks
   *   - "forks"         — only forks
   *   - "private"       — only private repos
   */
  async listReposForInstallation(
    installationDbId: string,
    opts: { q?: string; type?: string } = {},
  ): Promise<RepoRow[]> {
    const inst = await this.prisma.githubInstallation.findUnique({
      where: { id: installationDbId },
      include: { registration: true },
    });
    if (!inst) throw new NotFoundException(`No installation ${installationDbId}`);

    const token = await this.installationToken(inst.registration, inst.installationId);
    const octokit = new Octokit({ auth: token });
    // Paginate through; we cap at 200 for the picker — anything beyond that
    // and the user really should be using the search box.
    const repos: ReturnedRepo[] = [];
    let page = 1;
    while (repos.length < 200) {
      const res = await octokit.rest.apps.listReposAccessibleToInstallation({
        per_page: 100,
        page,
      });
      const batch = (res.data?.repositories ?? []) as ReturnedRepo[];
      repos.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }

    const q = opts.q?.trim().toLowerCase();
    const filtered = repos.filter((r) => {
      if (q && !r.full_name.toLowerCase().includes(q)) return false;
      switch (opts.type) {
        case 'sources':
          return !r.fork;
        case 'forks':
          return r.fork;
        case 'private':
          return r.private;
        default:
          return true;
      }
    });
    return filtered.map(projectRepo);
  }

  private appOctokitFor(
    registration: Parameters<GithubRegistrationsService['decryptAppCredentials']>[0],
  ) {
    const creds = this.registrations.decryptAppCredentials(registration);
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: creds.appId, privateKey: creds.privateKeyPem },
    });
  }

  private async installationToken(
    registration: Parameters<GithubRegistrationsService['decryptAppCredentials']>[0],
    installationId: number,
  ): Promise<string> {
    const creds = this.registrations.decryptAppCredentials(registration);
    const auth = createAppAuth({ appId: creds.appId, privateKey: creds.privateKeyPem });
    const result = await auth({ type: 'installation', installationId });
    return result.token;
  }
}

interface ReturnedInstallation {
  id: number;
  app_id: number;
  account?: { login?: string; type?: string; id?: number } | null;
  html_url?: string | null;
  permissions?: Record<string, string>;
  events?: string[];
  repository_selection?: string;
}

interface ReturnedRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  fork: boolean;
  default_branch?: string | null;
  html_url: string;
}

function projectInstallation(row: GithubInstallation): InstallationRow {
  return {
    id: row.id,
    registrationId: row.registrationId,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    accountId: row.accountId,
    htmlUrl: row.htmlUrl,
    permissions: (row.permissions ?? {}) as Record<string, string>,
    events: row.events,
    repositorySelection: row.repositorySelection,
    syncedAt: row.syncedAt.toISOString(),
  };
}

function projectRepo(r: ReturnedRepo): RepoRow {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    fork: r.fork,
    defaultBranch: r.default_branch ?? null,
    htmlUrl: r.html_url,
  };
}
