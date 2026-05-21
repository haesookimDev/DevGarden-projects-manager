import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { ClientsService } from './clients.service';

@Controller('internal/clients')
@UseGuards(InternalAuthGuard)
export class ClientsInternalController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  async list(@Query('ownerId') ownerId: string) {
    if (!ownerId) throw new BadRequestException('ownerId query param is required');
    const items = await this.clients.listByOwner(ownerId);
    return items.map((c) => ({
      id: c.id,
      name: c.name,
      hostname: c.hostname,
      os: c.os,
      version: c.version,
      status: c.status,
      lastSeenAt: c.lastSeenAt ? c.lastSeenAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  @Post('pairings')
  async issuePairing(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.ownerId !== 'string' || !b.ownerId) {
      throw new BadRequestException('ownerId must be a non-empty string');
    }
    if (typeof b.clientName !== 'string' || !b.clientName) {
      throw new BadRequestException('clientName must be a non-empty string');
    }

    const issued = await this.clients.issuePairingToken({
      ownerId: b.ownerId,
      clientName: b.clientName,
    });
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }
}
