import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';

export interface ClientJwtPayload {
  clientId: string;
  ownerId: string;
}

const ISSUER = 'devgarden-api';
const AUDIENCE = 'devgarden-client';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

@Injectable()
export class ClientJwtService {
  private secret(): Uint8Array {
    const v = process.env.AUTH_SECRET;
    if (!v) throw new InternalServerErrorException('AUTH_SECRET is not set');
    return new TextEncoder().encode(v);
  }

  async sign(payload: ClientJwtPayload, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
    return new SignJWT({ ownerId: payload.ownerId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.clientId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.secret());
  }

  async verify(token: string): Promise<ClientJwtPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret(), {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const clientId = payload.sub;
      const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : undefined;
      if (!clientId || !ownerId) {
        throw new UnauthorizedException('Token missing subject or ownerId');
      }
      return { clientId, ownerId };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid client token');
    }
  }
}
