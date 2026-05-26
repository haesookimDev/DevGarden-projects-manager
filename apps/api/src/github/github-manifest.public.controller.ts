import { BadRequestException, Controller, Get, Query, Redirect } from '@nestjs/common';

import { GithubManifestService } from './github-manifest.service';

// GitHub redirects the user here once the App has been created, hitting the
// api directly (not through the web BFF). No InternalAuthGuard — the security
// is the state token, which is single-use and TTL-bound.
//
// The handler exchanges the manifest code, persists the registration, then
// 302's the user back to the web app so they can pick installations next.
@Controller('webhooks/github')
export class GithubManifestPublicController {
  constructor(private readonly manifest: GithubManifestService) {}

  @Get('manifest-callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    if (!code || !state) {
      throw new BadRequestException('Both ?code= and ?state= are required.');
    }
    const registration = await this.manifest.complete(code, state);

    const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? '';
    const url = `${publicBaseUrl.replace(/\/$/, '')}/dashboard/onboarding/installed?registrationId=${encodeURIComponent(
      registration.id,
    )}`;
    // 303 makes the resulting GET clearly distinct from a form re-submit if
    // the browser back-button takes the user here.
    return { url, statusCode: 303 };
  }
}
