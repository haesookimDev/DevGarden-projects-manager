// End-to-end socket test: client emits run:log → RunsGateway persists + fans
// out → internal subscriber receives the same event. Validates that the
// namespace-scoped room shortcut works across both connection types.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { PrismaClient, UserRole } from '@prisma/client';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { ClientJwtService } from '../../src/clients/client-jwt.service';
import { ClientsGateway } from '../../src/clients/clients.gateway';
import { BudgetMonitorService } from '../../src/budget/budget-monitor.service';
import { BudgetService } from '../../src/budget/budget.service';
import { GithubPrService } from '../../src/github/github-pr.service';
import { NotificationService } from '../../src/notifications/notifications.service';
import { SlackWebhookChannel } from '../../src/notifications/slack-webhook.channel';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RunsGateway } from '../../src/runs/runs.gateway';
import { RunsService } from '../../src/runs/runs.service';

const INTERNAL_SECRET = 'broadcast-test-internal-secret';
const AUTH_SECRET = 'broadcast-test-auth-secret-with-enough-length-please';

const prisma = new PrismaClient();
let app: INestApplication;
let port: number;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await prisma.$connect();
  process.env.AUTH_SECRET = AUTH_SECRET;
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [
      ClientJwtService,
      ClientsGateway,
      RunsGateway,
      RunsService,
      BudgetService,
      BudgetMonitorService,
      NotificationService,
      SlackWebhookChannel,
      // GithubPrService is only invoked by the github:openPR handler — these
      // tests never trigger that path, so a stub keeps the DI graph happy
      // without bringing the GitHub App env vars into scope.
      { provide: GithubPrService, useValue: { open: () => Promise.reject(new Error('not used')) } },
    ],
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
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  while (sockets.length) sockets.pop()?.disconnect();
});

function connect(token: string): Promise<ClientSocket> {
  const socket = ioClient(`http://localhost:${port}/clients`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise<ClientSocket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function seed() {
  const user = await prisma.user.create({
    data: { githubId: 9100, login: 'b-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'bx/bp',
      localRoot: '/tmp/bp',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'bcast', definition: { name: 'bcast', version: 1, steps: [] } },
  });
  const clientRow = await prisma.client.create({
    data: { ownerId: user.id, name: 'bcast-client', jwtTokenHash: 'placeholder' },
  });
  const run = await prisma.harnessRun.create({
    data: {
      harnessId: harness.id,
      projectId: project.id,
      clientId: clientRow.id,
      triggeredByUserId: user.id,
    },
  });
  return { user, run, clientRow };
}

describe('RunsGateway fan-out + internal subscribe', () => {
  it('routes run:log from a client to an internal subscriber in run:<id> room', async () => {
    const { run, clientRow, user } = await seed();
    const jwtSvc = new ClientJwtService();
    const clientJwt = await jwtSvc.sign({ clientId: clientRow.id, ownerId: user.id });

    const subscriber = await connect(INTERNAL_SECRET);
    const subAck = await subscriber.emitWithAck('subscribe:run', { runId: run.id });
    expect(subAck).toEqual({ ok: true });

    const received = new Promise<unknown>((resolve) => {
      subscriber.once('run:log', (p: unknown) => resolve(p));
    });

    const client = await connect(clientJwt);
    const ack = await client.emitWithAck('run:log', {
      runId: run.id,
      level: 'info',
      source: 'tool/x',
      message: 'hello',
    });
    expect(ack).toEqual({ ok: true });

    const payload = (await Promise.race([
      received,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3_000)),
    ])) as { runId: string; message: string };
    expect(payload.runId).toBe(run.id);
    expect(payload.message).toBe('hello');
  });

  it('rejects subscribe:run from a client-JWT socket (only internal allowed)', async () => {
    const { clientRow, user, run } = await seed();
    const jwtSvc = new ClientJwtService();
    const clientJwt = await jwtSvc.sign({ clientId: clientRow.id, ownerId: user.id });

    const client = await connect(clientJwt);
    const ack = await client.emitWithAck('subscribe:run', { runId: run.id });
    expect(ack).toEqual({ ok: false });
  });
});
