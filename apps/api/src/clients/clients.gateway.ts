import { Logger } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CLONE_EVENTS, type CloneStartPayload } from '@devgarden/shared';
import { ClientStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ClientJwtService } from './client-jwt.service';

interface AuthedSocketData {
  clientId?: string;
  ownerId?: string;
  /** True when authenticated via INTERNAL_API_SECRET (server-side BFF). */
  isInternal?: boolean;
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

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly clientJwt: ClientJwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Used by the projects controller when a clone is dispatched from the web
  // BFF. Emits to the `client:<id>` room that `handleConnection` joins on
  // successful pairing-JWT verification, so the sidecar's
  // `socket.on('client:cloneProject', ...)` handler fires.
  emitCloneStart(clientId: string, payload: CloneStartPayload): void {
    this.server.to(`client:${clientId}`).emit(CLONE_EVENTS.Start, payload);
  }

  async handleConnection(@ConnectedSocket() socket: Socket): Promise<void> {
    const token = extractToken(socket);
    if (!token) {
      this.logger.warn(`socket ${socket.id} rejected: no token`);
      socket.disconnect(true);
      return;
    }

    if (matchesInternalSecret(token)) {
      const data = socket.data as AuthedSocketData;
      data.isInternal = true;
      this.logger.log(`socket ${socket.id} connected as internal subscriber`);
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
    if (data.isInternal) return;
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

function matchesInternalSecret(provided: string): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
