import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { ClientStatus, type Client } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientJwtService } from './client-jwt.service';

const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const BCRYPT_ROUNDS = 10;

export interface IssuePairingTokenInput {
  ownerId: string;
  clientName: string;
}

export interface IssuedPairingToken {
  token: string;
  expiresAt: Date;
}

export interface ConsumePairingTokenInput {
  token: string;
  hostname?: string;
  os?: string;
  version?: string;
}

export interface ConsumedPairing {
  client: Client;
  jwt: string;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientJwt: ClientJwtService,
  ) {}

  async issuePairingToken(
    input: IssuePairingTokenInput,
    now: Date = new Date(),
  ): Promise<IssuedPairingToken> {
    const owner = await this.prisma.user.findUnique({ where: { id: input.ownerId } });
    if (!owner) throw new NotFoundException(`User ${input.ownerId} not found`);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
    const expiresAt = new Date(now.getTime() + PAIRING_TOKEN_TTL_MS);

    await this.prisma.clientPairing.create({
      data: {
        ownerId: input.ownerId,
        clientName: input.clientName,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async consumePairingToken(
    input: ConsumePairingTokenInput,
    now: Date = new Date(),
  ): Promise<ConsumedPairing> {
    // Search candidates: unconsumed + unexpired. bcrypt requires per-row compare.
    const candidates = await this.prisma.clientPairing.findMany({
      where: { consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    let matched: (typeof candidates)[number] | undefined;
    for (const c of candidates) {
      if (await bcrypt.compare(input.token, c.tokenHash)) {
        matched = c;
        break;
      }
    }

    if (!matched) throw new UnauthorizedException('Pairing token is invalid or expired');

    const tempJwtHash = randomBytes(16).toString('hex');
    const client = await this.prisma.client.create({
      data: {
        ownerId: matched.ownerId,
        name: matched.clientName,
        hostname: input.hostname,
        os: input.os,
        version: input.version,
        jwtTokenHash: tempJwtHash,
        status: ClientStatus.OFFLINE,
      },
    });

    const jwt = await this.clientJwt.sign({ clientId: client.id, ownerId: matched.ownerId });
    const finalJwtHash = await bcrypt.hash(jwt, BCRYPT_ROUNDS);

    await Promise.all([
      this.prisma.clientPairing.update({
        where: { id: matched.id },
        data: { consumedAt: now },
      }),
      this.prisma.client.update({
        where: { id: client.id },
        data: { jwtTokenHash: finalJwtHash },
      }),
    ]);

    return { client: { ...client, jwtTokenHash: finalJwtHash }, jwt };
  }
}
