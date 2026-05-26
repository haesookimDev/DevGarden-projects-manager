import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { GithubAppRegistration } from '@prisma/client';

import { GithubRegistrationsService } from './github-registrations.service';
import { buildManifest, manifestSubmitUrl, type GithubAppManifest } from './manifest-builder';
import { ManifestStateService } from './manifest-state.service';
import { OCTOKIT_FACTORY, type OctokitFactory } from './github-registrations.service';

// Shape returned by GitHub's `POST /app-manifests/:code/conversions` call.
// The octokit response data is loosely typed (Record<string, unknown>) so
// declare a strict subset for the fields we actually use.
interface ManifestConversionResult {
  id: number;
  slug?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  webhook_secret?: string | null;
  pem: string;
  html_url?: string | null;
}

@Injectable()
export class GithubManifestService {
  private readonly logger = new Logger(GithubManifestService.name);

  constructor(
    private readonly state: ManifestStateService,
    private readonly registrations: GithubRegistrationsService,
    @Inject(OCTOKIT_FACTORY) private readonly octokitFactory: OctokitFactory,
  ) {}

  /**
   * Step 1: build the manifest the web UI will POST as a hidden form to
   * GitHub. Returns the state token to embed alongside the manifest.
   */
  start(ownerId: string): {
    state: string;
    manifest: GithubAppManifest;
    submitUrl: string;
  } {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
      throw new BadRequestException(
        'PUBLIC_BASE_URL is not configured on the api. Manifest flow needs a ' +
          'reachable URL — set PUBLIC_BASE_URL (e.g. https://devgarden.example.com) ' +
          'or use the BYO path on localhost.',
      );
    }
    const manifest = buildManifest({ publicBaseUrl });
    const state = this.state.issue(ownerId);
    return { state, manifest, submitUrl: manifestSubmitUrl(state) };
  }

  /**
   * Step 2: GitHub redirected back with ?code=…&state=…. Validate the state,
   * exchange the code for full App credentials via octokit, persist them.
   */
  async complete(code: string, state: string): Promise<GithubAppRegistration> {
    const ownerId = this.state.consume(state);
    if (!ownerId) {
      throw new BadRequestException(
        'Manifest state is invalid or has expired. Restart the GitHub App creation flow.',
      );
    }
    // Manifest conversions require an *anonymous* Octokit — we don't have App
    // credentials yet; the conversion call is what mints them. Pass dummy
    // appId/privateKey through the factory and ignore the auth strategy. In
    // tests the factory is overridden anyway.
    const octokit = this.octokitFactory({ appId: 0, privateKey: '' });
    let result: ManifestConversionResult;
    try {
      const res = await octokit.rest.apps.createFromManifest({ code });
      result = res.data as unknown as ManifestConversionResult;
    } catch (err) {
      this.logger.warn(
        `Manifest conversion failed for state=${state.slice(0, 6)}…: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        'GitHub rejected the manifest code. The code may have been used already or expired.',
      );
    }

    if (!result?.id || !result.pem || !result.webhook_secret) {
      throw new BadRequestException('GitHub returned an incomplete manifest conversion response.');
    }

    return this.registrations.createFromManifest({
      ownerId,
      appId: result.id,
      appSlug: result.slug ?? null,
      privateKeyPem: result.pem,
      webhookSecret: result.webhook_secret,
      clientId: result.client_id ?? null,
      clientSecret: result.client_secret ?? null,
      htmlUrl: result.html_url ?? null,
    });
  }
}
