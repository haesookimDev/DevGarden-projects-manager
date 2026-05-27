import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ClientJwtService, type ClientJwtPayload } from '../clients/client-jwt.service';

/**
 * Guards endpoints that the paired desktop sidecar calls over HTTP.
 *
 * The sidecar already opens an authenticated socket.io connection on
 * /clients — but socket auth doesn't carry over to HTTP requests. This
 * guard re-validates the same JWT (Authorization: Bearer <jwt>) and
 * attaches the decoded payload to `req.client` so the controller can read
 * which client (and therefore which owner) is calling.
 */
@Injectable()
export class ClientJwtAuthGuard implements CanActivate {
  constructor(private readonly clientJwt: ClientJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithClient>();
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedException('Empty Bearer token');

    const payload = await this.clientJwt.verify(token);
    req.client = payload;
    return true;
  }
}

export interface RequestWithClient extends Request {
  client?: ClientJwtPayload;
}
