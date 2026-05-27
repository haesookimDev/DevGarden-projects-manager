import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard, type RequestWithClient } from '../auth/client-jwt-auth.guard';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * HTTP endpoints the desktop sidecar calls directly with its pairing JWT.
 *
 * Unlike `internal/*` which is gated by INTERNAL_API_SECRET (server-only
 * BFF), these routes are gated by ClientJwtAuthGuard — the same JWT the
 * sidecar uses for its socket.io connection.
 */
@Controller('internal/clients')
@UseGuards(ClientJwtAuthGuard)
export class ClientsSidecarController {
  constructor(
    private readonly githubApp: GithubAppService,
    private readonly prisma: PrismaService,
  ) {}

  // Mints a short-lived (~1h) installation access token. The sidecar uses
  // the token to clone the repo over HTTPS. We verify the installation row
  // belongs to the calling client's owner so a compromised pairing token
  // can't be used to pull tokens for other installations.
  @Post('installation-tokens')
  async issueInstallationToken(
    @Body() body: unknown,
    @Req() req: RequestWithClient,
  ): Promise<{ token: string }> {
    if (!req.client) throw new ForbiddenException('client context missing');
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.installationId !== 'number' || !Number.isFinite(b.installationId)) {
      throw new BadRequestException('installationId must be a number');
    }

    // The installation must be linked to a GithubAppRegistration owned by
    // the same user as the calling client. This forecloses lateral access
    // — a pairing JWT can only mint tokens for installs its owner controls.
    const install = await this.prisma.githubInstallation.findUnique({
      where: { installationId: b.installationId },
      include: { registration: { select: { ownerId: true } } },
    });
    if (!install) throw new ForbiddenException('installation not found');
    if (install.registration.ownerId !== req.client.ownerId) {
      throw new ForbiddenException('installation does not belong to calling owner');
    }

    const token = await this.githubApp.getInstallationToken(b.installationId);
    return { token };
  }
}
