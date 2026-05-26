import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { GithubInstallationsService } from './github-installations.service';

/**
 * Picker-facing data — list of installations the user can choose from and the
 * repos under each one. Inside the api everything is GET (idempotent) except
 * the explicit /sync trigger; the listing endpoint is GET-with-side-effect by
 * design (the N1 plan §3.2 calls it out) — sending it as POST would be
 * misleading because the BFF treats it as "read installations".
 */
@Controller('internal/github/installations')
@UseGuards(InternalAuthGuard)
export class GithubInstallationsInternalController {
  constructor(private readonly svc: GithubInstallationsService) {}

  /**
   * Lists installations.
   *
   * If `x-user-github-token` is present, the api calls
   * `apps.listInstallationsForAuthenticatedUser` with that user OAuth token,
   * filters to installations of *our* App, and upserts the rows before
   * returning. The BFF passes the NextAuth session's access_token through
   * this header — the api never touches the cookie.
   *
   * If the header is absent, the endpoint reads the cached rows from the DB
   * (no GitHub call). Useful for the BFF's initial render before the user
   * clicks "Refresh installations".
   */
  @Get()
  async list(
    @Query('ownerId') ownerId: string,
    @Headers('x-user-github-token') userToken: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    if (userToken) {
      return this.svc.listForUser({ ownerId, userOauthToken: userToken });
    }
    return this.svc.listFromDb(ownerId);
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    return this.svc.syncOne(id);
  }

  @Get(':id/repos')
  async repos(
    @Param('id') id: string,
    @Query('q') q: string | undefined,
    @Query('type') type: string | undefined,
  ) {
    return this.svc.listReposForInstallation(id, { q, type });
  }
}
