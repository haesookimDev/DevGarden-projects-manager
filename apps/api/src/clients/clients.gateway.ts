import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ClientStatus } from '@prisma/client';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ClientJwtService } from './client-jwt.service';

interface AuthedSocketData {
  clientId?: string;
  ownerId?: string;
}

/**
 * Desktop client → api WebSocket entry point.
 *
 * Connection model:
 *   - Client opens a socket.io connection to `/clients` namespace with the
 *     pairing JWT in `auth.token` (or `Authorization: Bearer <jwt>` header).
 *   - On a valid token: socket joins `client:<id>` room, Client row flips to ONLINE.
 *   - `heartbeat` event refreshes `lastSeenAt`.
 *   - On disconnect: row flips to OFFLINE.
 *
 * Future PRs will broadcast `run:*` events into `project:<id>` rooms so the
 * web dashboard can subscribe to live run logs.
 */
@WebSocketGateway({
  namespace: '/clients',
  cors: { origin: '*' },
})
export class ClientsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ClientsGateway.name);

  constructor(
    private readonly clientJwt: ClientJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() socket: Socket): Promise<void> {
    const token = extractToken(socket);
    if (!token) {
      this.logger.warn(`socket ${socket.id} rejected: no token`);
      socket.disconnect(true);
      return;
    }

    try {
      const { clientId, ownerId } = await this.clientJwt.verify(token);
      const data = socket.data as AuthedSocketData;
      data.clientId = clientId;
      data.ownerId = ownerId;
      await socket.join(`client:${clientId}`);
      await this.prisma.client.update({
        where: { id: clientId },
        data: { status: ClientStatus.ONLINE, lastSeenAt: new Date() },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'verify failed';
      this.logger.warn(`socket ${socket.id} rejected: ${msg}`);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(@ConnectedSocket() socket: Socket): Promise<void> {
    const data = socket.data as AuthedSocketData;
    if (!data.clientId) return;
    try {
      await this.prisma.client.update({
        where: { id: data.clientId },
        data: { status: ClientStatus.OFFLINE, lastSeenAt: new Date() },
      });
    } catch (err) {
      // Client row might have been deleted between connect and disconnect.
      this.logger.warn(`disconnect update failed for ${data.clientId}: ${(err as Error).message}`);
    }
  }

  @SubscribeMessage('heartbeat')
  async onHeartbeat(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: true; ts: string } | { ok: false }> {
    const data = socket.data as AuthedSocketData;
    if (!data.clientId) return { ok: false };

    const now = new Date();
    await this.prisma.client.update({
      where: { id: data.clientId },
      data: { lastSeenAt: now, status: ClientStatus.ONLINE },
    });
    return { ok: true, ts: now.toISOString() };
  }
}

function extractToken(socket: Socket): string | undefined {
  const handshakeAuth = socket.handshake.auth as { token?: unknown } | undefined;
  if (handshakeAuth && typeof handshakeAuth.token === 'string') return handshakeAuth.token;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return undefined;
}
