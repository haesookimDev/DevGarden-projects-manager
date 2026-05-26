import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { GithubManifestService } from './github-manifest.service';
import { GithubRegistrationsService, projectRegistration } from './github-registrations.service';

@Controller('internal/github/registrations')
@UseGuards(InternalAuthGuard)
export class GithubRegistrationsInternalController {
  constructor(
    private readonly svc: GithubRegistrationsService,
    private readonly manifest: GithubManifestService,
  ) {}

  @Get()
  async getOne(@Query('ownerId') ownerId: string) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    const row = await this.svc.getByOwner(ownerId);
    if (!row) throw new NotFoundException(`No registration for owner ${ownerId}`);
    return projectRegistration(row);
  }

  /**
   * Issues a manifest + state token for the BFF to render as an auto-submit
   * form pointed at https://github.com/settings/apps/new. The BFF only sees
   * the JSON; it never touches secrets.
   */
  @Post('manifest/start')
  startManifest(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const ownerId = requireBodyString(body as Record<string, unknown>, 'ownerId');
    return this.manifest.start(ownerId);
  }

  @Post()
  async createByo(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const ownerId = requireString(b, 'ownerId');
    const appIdRaw = b.appId;
    const appId =
      typeof appIdRaw === 'number'
        ? appIdRaw
        : typeof appIdRaw === 'string'
          ? Number(appIdRaw)
          : NaN;
    if (!Number.isFinite(appId) || !Number.isInteger(appId) || appId <= 0) {
      throw new BadRequestException('appId must be a positive integer');
    }
    const privateKeyPem = requireString(b, 'privateKeyPem');
    const webhookSecret = optionalString(b, 'webhookSecret');
    const clientId = optionalString(b, 'clientId');
    const clientSecret = optionalString(b, 'clientSecret');

    const row = await this.svc.createByo({
      ownerId,
      appId,
      privateKeyPem,
      webhookSecret,
      clientId,
      clientSecret,
    });
    return projectRegistration(row);
  }
}

function requireString(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string' || !v) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return v;
}

// Aliased so the new manifest/start handler can call it without re-declaring.
const requireBodyString = requireString;

function optionalString(b: Record<string, unknown>, key: string): string | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') {
    throw new BadRequestException(`${key} must be a string when provided`);
  }
  return v.length === 0 ? undefined : v;
}
