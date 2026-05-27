// BFF helpers for the new GitHub onboarding endpoints (N1).
// Server-side only — these use internalFetch, which carries the
// INTERNAL_API_SECRET that the api validates via InternalAuthGuard.

import { internalFetch } from './internal';

export type RegistrationSource = 'MANIFEST' | 'BYO';

export interface GithubRegistration {
  id: string;
  ownerId: string;
  source: RegistrationSource;
  appId: number;
  appSlug: string | null;
  clientId: string | null;
  htmlUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GithubAppManifest {
  name: string;
  url: string;
  hook_attributes: { url: string; active?: boolean };
  redirect_url: string;
  setup_url?: string;
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
  [k: string]: unknown;
}

export interface ManifestStartResponse {
  state: string;
  manifest: GithubAppManifest;
  submitUrl: string;
}

export async function getRegistration(ownerId: string): Promise<GithubRegistration | null> {
  const res = await internalFetch(
    `/internal/github/registrations?ownerId=${encodeURIComponent(ownerId)}`,
    { method: 'GET' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /internal/github/registrations failed: ${res.status}`);
  return (await res.json()) as GithubRegistration;
}

export async function startManifest(ownerId: string): Promise<ManifestStartResponse> {
  const res = await internalFetch(`/internal/github/registrations/manifest/start`, {
    method: 'POST',
    body: { ownerId },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`manifest start failed: ${res.status} ${body}`);
  }
  return (await res.json()) as ManifestStartResponse;
}

export interface CreateByoPayload {
  ownerId: string;
  appId: number;
  privateKeyPem: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function createByoRegistration(
  payload: CreateByoPayload,
): Promise<GithubRegistration> {
  const res = await internalFetch(`/internal/github/registrations`, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`BYO registration failed: ${res.status} ${body}`);
  }
  return (await res.json()) as GithubRegistration;
}

export interface GithubInstallation {
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

/**
 * Cached read from the api's DB. No GitHub call — fast, suitable for SSR.
 * Returns [] when the owner has no registration yet.
 */
export async function listInstallationsFromDb(ownerId: string): Promise<GithubInstallation[]> {
  const res = await internalFetch(
    `/internal/github/installations?ownerId=${encodeURIComponent(ownerId)}`,
    { method: 'GET' },
  );
  if (!res.ok) throw new Error(`list installations (DB) failed: ${res.status}`);
  return (await res.json()) as GithubInstallation[];
}

/**
 * Forces a refresh from GitHub via the user's OAuth token. The api filters
 * by appId and upserts; returns the freshly synced rows.
 */
export async function syncInstallationsFromGithub(
  ownerId: string,
  userGithubToken: string,
): Promise<GithubInstallation[]> {
  const res = await internalFetch(
    `/internal/github/installations?ownerId=${encodeURIComponent(ownerId)}`,
    { method: 'GET', headers: { 'x-user-github-token': userGithubToken } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sync installations failed: ${res.status} ${body}`);
  }
  return (await res.json()) as GithubInstallation[];
}
