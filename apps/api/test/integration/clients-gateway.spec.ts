// End-to-end test: real NestJS app + real socket.io server + real socket.io
// client. Verifies JWT auth on connect, heartbeat → DB update, disconnect →
// status flip.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { ClientStatus, PrismaClient, UserRole } from '@prisma/client';
import { ClientJwtService } from '../../src/clients/client-jwt.service';
import { ClientsGateway } from '../../src/clients/clients.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';

const prisma = new PrismaClient();
let app: INestApplication;
let port: number;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await prisma.$connect();
  process.env.AUTH_SECRET = 'integration-test-secret-with-enough-length-please';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [ClientJwtService, ClientsGateway],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(0);
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') throw new Error('no port');
  port = address.port;
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  while (sockets.length) sockets.pop()?.disconnect();
});

async function makeAuthedClient(jwt: string): Promise<ClientSocket> {
  const socket = ioClient(`http://localhost:${port}/clients`, {
    auth: { token: jwt },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (err) => reject(err));
  });
  return socket;
}

async function waitUntil<T>(probe: () => Promise<T>, predicate: (v: T) => boolean): Promise<T> {
  const deadline = Date.now() + 3000;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await probe();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`waitUntil timed out (last=${JSON.stringify(last)})`);
}

describe('ClientsGateway', () => {
  it('rejects connections without a token', async () => {
    const socket = ioClient(`http://localhost:${port}/clients`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    expect(socket.connected).toBe(false);
  });

  it('rejects connections with a garbage token', async () => {
    const socket = ioClient(`http://localhost:${port}/clients`, {
      auth: { token: 'not-a-jwt' },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    expect(socket.connected).toBe(false);
  });

  it('flips client to ONLINE on connect, OFFLINE on disconnect', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 9001, login: 'gw-a', role: UserRole.OWNER },
    });
    const client = await prisma.client.create({
      data: { ownerId: owner.id, name: 'GW Client', jwtTokenHash: 'placeholder' },
    });
    const jwtSvc = new ClientJwtService();
    const jwt = await jwtSvc.sign({ clientId: client.id, ownerId: owner.id });

    const socket = await makeAuthedClient(jwt);

    await waitUntil(
      () => prisma.client.findUnique({ where: { id: client.id } }),
      (c) => c?.status === ClientStatus.ONLINE,
    );

    socket.disconnect();
    await waitUntil(
      () => prisma.client.findUnique({ where: { id: client.id } }),
      (c) => c?.status === ClientStatus.OFFLINE,
    );
  });

  it('heartbeat refreshes lastSeenAt and acks { ok: true }', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 9002, login: 'gw-b', role: UserRole.OWNER },
    });
    const client = await prisma.client.create({
      data: { ownerId: owner.id, name: 'HB Client', jwtTokenHash: 'placeholder' },
    });
    const jwtSvc = new ClientJwtService();
    const jwt = await jwtSvc.sign({ clientId: client.id, ownerId: owner.id });

    const socket = await makeAuthedClient(jwt);
    await waitUntil(
      () => prisma.client.findUnique({ where: { id: client.id } }),
      (c) => c?.status === ClientStatus.ONLINE,
    );

    const before = await prisma.client.findUnique({ where: { id: client.id } });
    await new Promise((r) => setTimeout(r, 30));

    const ack = await socket.emitWithAck('heartbeat');
    expect(ack).toEqual(expect.objectContaining({ ok: true }));

    const after = await prisma.client.findUnique({ where: { id: client.id } });
    expect(after?.lastSeenAt?.getTime() ?? 0).toBeGreaterThan(before?.lastSeenAt?.getTime() ?? 0);
  });
});
