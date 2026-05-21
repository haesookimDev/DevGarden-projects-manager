import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsPublicController {
  constructor(private readonly clients: ClientsService) {}

  // Called by the desktop client after the user types the pairing token.
  // No InternalAuthGuard: the pairing token itself is the credential.
  @Post('pair')
  async pair(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.token !== 'string' || !b.token) {
      throw new BadRequestException('token must be a non-empty string');
    }

    const { client, jwt } = await this.clients.consumePairingToken({
      token: b.token,
      hostname: typeof b.hostname === 'string' ? b.hostname : undefined,
      os: typeof b.os === 'string' ? b.os : undefined,
      version: typeof b.version === 'string' ? b.version : undefined,
    });

    return {
      clientId: client.id,
      jwt,
      name: client.name,
    };
  }
}
