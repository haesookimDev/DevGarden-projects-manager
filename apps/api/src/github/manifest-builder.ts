import { InternalServerErrorException } from '@nestjs/common';

// Schema of the manifest object we hand to GitHub's "Create App from manifest"
// flow. Keep this typed against GitHub's documented shape rather than the
// octokit type (which is overly permissive and doesn't include all the keys
// we actually need to set).
//
// Docs: https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
export interface GithubAppManifest {
  name: string;
  url: string;
  hook_attributes: { url: string; active?: boolean };
  redirect_url: string;
  callback_urls?: string[];
  setup_url?: string;
  setup_on_update?: boolean;
  public: boolean;
  default_permissions: Record<string, 'read' | 'write' | 'admin'>;
  default_events: string[];
  request_oauth_on_install?: boolean;
  description?: string;
}

export interface ManifestBuildContext {
  /** Fully-qualified base URL of the api as the *outside world* reaches it.
   *  Required: GitHub will not accept a localhost or IP-only manifest. */
  publicBaseUrl: string;
  /** Optional override for the GitHub App's display name. */
  appName?: string;
  /** Optional override for a one-line description shown on the GitHub setup
   *  screen. */
  description?: string;
}

export const DEFAULT_APP_NAME = 'DevGarden (self-hosted)';

// Minimum permission set the existing harness toolset (M3/M4) needs. This is
// the same matrix documented in docs/SELF-HOSTING.md §6.1.5, expressed in the
// shape GitHub expects on the manifest.
export const DEFAULT_PERMISSIONS: GithubAppManifest['default_permissions'] = {
  contents: 'write',
  metadata: 'read',
  pull_requests: 'write',
  issues: 'write',
};

export const DEFAULT_EVENTS: string[] = ['pull_request', 'issues', 'push'];

export function buildManifest(ctx: ManifestBuildContext): GithubAppManifest {
  const base = trimTrailingSlash(ctx.publicBaseUrl);
  if (!/^https?:\/\//i.test(base)) {
    throw new InternalServerErrorException(
      'PUBLIC_BASE_URL must include an http(s):// scheme. ' +
        'GitHub rejects relative or scheme-less manifest URLs.',
    );
  }
  return {
    name: ctx.appName ?? DEFAULT_APP_NAME,
    url: base,
    description:
      ctx.description ??
      'Self-hosted DevGarden instance — runs LLM agents that read your repos and open PRs.',
    hook_attributes: { url: `${base}/webhooks/github`, active: true },
    redirect_url: `${base}/webhooks/github/manifest-callback`,
    setup_url: `${base}/dashboard/onboarding/installed`,
    setup_on_update: true,
    public: false,
    default_permissions: { ...DEFAULT_PERMISSIONS },
    default_events: [...DEFAULT_EVENTS],
    request_oauth_on_install: false,
  };
}

export function manifestSubmitUrl(state: string): string {
  // The web client POSTs an HTML form to this URL with `manifest=<json>` and
  // `state=<csrf>` so the manifest body never has to fit in a URL.
  return `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
}

function trimTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
