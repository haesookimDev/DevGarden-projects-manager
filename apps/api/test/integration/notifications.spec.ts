// Integration test for N5 notifications: real prisma + the internal controller
// for settings CRUD / test / inbox, and the NotificationService directly for
// fanOut (run terminal) + notify (budget seam).

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, RunStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { resetEncryptionKeyCache } from '../../src/crypto/envelope';
import { EmailChannel, MAIL_TRANSPORT } from '../../src/notifications/email.channel';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { NotificationsInternalController } from '../../src/notifications/notifications.internal.controller';
import { NotificationService } from '../../src/notifications/notifications.service';
import { SlackWebhookChannel } from '../../src/notifications/slack-webhook.channel';

const prisma = new PrismaClient();
const SECRET = 'notif-test-secret';

const sentMail = vi.fn().mockResolvedValue(undefined);

let app: INestApplication;
let service: NotificationService;

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  resetEncryptionKeyCache();

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [NotificationsInternalController],
    providers: [
      NotificationService,
      SlackWebhookChannel,
      EmailChannel,
      { provide: MAIL_TRANSPORT, useValue: { sendMail: sentMail } },
    ],
  }).compile();

  service = moduleRef.get(NotificationService);
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  sentMail.mockClear();
  await prisma.notification.deleteMany();
  await prisma.userNotificationSettings.deleteMany();
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

async function seed() {
  const user = await prisma.user.create({
    data: { githubId: 1100, login: 'notif-owner', role: UserRole.OWNER },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'n/p',
      localRoot: '/tmp/n',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: user.id, name: 'h', definition: { name: 'h', version: 1, steps: [] } },
  });
  const client = await prisma.client.create({
    data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
  });
  return { user, project, harness, client };
}

async function makeRun(
  ids: {
    user: { id: string };
    project: { id: string };
    harness: { id: string };
    client: { id: string };
  },
  status: RunStatus,
) {
  return prisma.harnessRun.create({
    data: {
      harnessId: ids.harness.id,
      projectId: ids.project.id,
      clientId: ids.client.id,
      triggeredByUserId: ids.user.id,
      status,
    },
  });
}

describe('notification settings (HTTP)', () => {
  it('returns defaults when no settings row exists', async () => {
    const { user } = await seed();
    const res = await request(app.getHttpServer())
      .get(`/internal/users/${user.id}/notification-settings`)
      .set('x-internal-secret', SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      webToast: true,
      slackConfigured: false,
      emailEnabled: false,
      triggers: { success: false, failed: true, cancelled: false },
      perProject: {},
    });
  });

  it('upserts settings and merges triggers', async () => {
    const { user } = await seed();
    const res = await request(app.getHttpServer())
      .put(`/internal/users/${user.id}/notification-settings`)
      .set('x-internal-secret', SECRET)
      .send({
        webToast: true,
        triggers: { success: true },
        emailEnabled: true,
        emailAddress: 'a@b.co',
      });

    expect(res.status).toBe(200);
    expect(res.body.triggers).toEqual({ success: true, failed: true, cancelled: false });
    expect(res.body.emailEnabled).toBe(true);
    expect(res.body.emailAddress).toBe('a@b.co');
  });

  it('rejects an invalid email address', async () => {
    const { user } = await seed();
    const res = await request(app.getHttpServer())
      .put(`/internal/users/${user.id}/notification-settings`)
      .set('x-internal-secret', SECRET)
      .send({ emailAddress: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('delivers a test notification and lists it', async () => {
    const { user } = await seed();
    const test = await request(app.getHttpServer())
      .post(`/internal/users/${user.id}/notifications/test`)
      .set('x-internal-secret', SECRET);
    expect(test.status).toBe(201);
    expect(test.body.kind).toBe('test');

    const list = await request(app.getHttpServer())
      .get(`/internal/users/${user.id}/notifications`)
      .set('x-internal-secret', SECRET);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].kind).toBe('test');
  });
});

describe('NotificationService.fanOut', () => {
  it('creates a web toast for a FAILED run (default triggers) but not a SUCCESS run', async () => {
    const ids = await seed();
    const failed = await makeRun(ids, RunStatus.FAILED);
    const ok = await makeRun(ids, RunStatus.SUCCESS);

    await service.fanOut({ runId: failed.id, status: 'FAILED' });
    await service.fanOut({ runId: ok.id, status: 'SUCCESS' });

    const rows = await prisma.notification.findMany({ where: { userId: ids.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('run-failed');
    expect(rows[0]!.runId).toBe(failed.id);
  });

  it('honors a per-project trigger override', async () => {
    const ids = await seed();
    await service.upsertSettings(ids.user.id, {
      perProject: { [ids.project.id]: { success: true } },
    });
    const ok = await makeRun(ids, RunStatus.SUCCESS);

    await service.fanOut({ runId: ok.id, status: 'SUCCESS' });

    const rows = await prisma.notification.findMany({ where: { userId: ids.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('run-success');
  });

  it('delivers nothing when web toast is disabled', async () => {
    const ids = await seed();
    await service.upsertSettings(ids.user.id, { webToast: false });
    const failed = await makeRun(ids, RunStatus.FAILED);

    await service.fanOut({ runId: failed.id, status: 'FAILED' });

    const rows = await prisma.notification.findMany({ where: { userId: ids.user.id } });
    expect(rows).toHaveLength(0);
  });
});

describe('NotificationService.notify (budget seam)', () => {
  it('creates a budget web toast', async () => {
    const { user } = await seed();
    await service.notify({
      ownerId: user.id,
      kind: 'budget-warn',
      status: { spendUsd: 8, limitUsd: 10, warnAt: 80 },
    });

    const rows = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('budget-warn');
    expect(rows[0]!.body).toContain('$8.00 / $10.00');
  });
});

describe('Slack channel', () => {
  let slackServer: Server | undefined;

  afterEach(() => {
    slackServer?.close();
    slackServer = undefined;
  });

  // Local stand-in for a Slack incoming webhook; resolves with the first body.
  async function listenSlack(): Promise<{ url: string; received: Promise<string> }> {
    let resolveBody!: (b: string) => void;
    const received = new Promise<string>((r) => (resolveBody = r));
    slackServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(200).end();
        resolveBody(Buffer.concat(chunks).toString('utf8'));
      });
    });
    await new Promise<void>((r) => slackServer!.listen(0, '127.0.0.1', r));
    const addr = slackServer!.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    return { url: `http://127.0.0.1:${addr.port}/hook`, received };
  }

  it('stores the webhook URL encrypted and exposes only a masked hint', async () => {
    const { user } = await seed();
    const res = await request(app.getHttpServer())
      .put(`/internal/users/${user.id}/notification-settings`)
      .set('x-internal-secret', SECRET)
      .send({ slackWebhookUrl: 'https://hooks.slack.com/services/T/B/SECRET123' });

    expect(res.status).toBe(200);
    expect(res.body.slackConfigured).toBe(true);
    expect(res.body.slackHint).toBe('…RET123');
    expect(res.body.slackWebhookUrl).toBeUndefined();

    // The stored bytes must not contain the plaintext URL.
    const row = await prisma.userNotificationSettings.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row.slackWebhookUrl).not.toBeNull();
    expect(Buffer.from(row.slackWebhookUrl!).toString('utf8')).not.toContain('hooks.slack.com');
  });

  it('posts to the Slack webhook on fanOut when configured', async () => {
    const ids = await seed();
    const { url, received } = await listenSlack();
    await service.upsertSettings(ids.user.id, { slackWebhookUrl: url });
    const failed = await makeRun(ids, RunStatus.FAILED);

    await service.fanOut({ runId: failed.id, status: 'FAILED' });

    const body = (await Promise.race([
      received,
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000)),
    ])) as string;
    expect(JSON.parse(body).text).toContain('Run failed');
  });
});

describe('streamFor (SSE source)', () => {
  it('emits a delivered web toast to a subscriber for that user', async () => {
    const { user } = await seed();
    const got = new Promise<{ kind: string; title: string }>((resolve) => {
      const sub = service.streamFor(user.id).subscribe((n) => {
        sub.unsubscribe();
        resolve(n);
      });
    });

    await service.sendTest(user.id);

    const n = (await Promise.race([
      got,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2_000)),
    ])) as { kind: string; title: string };
    expect(n.kind).toBe('test');
    expect(n.title).toBe('Test notification');
  });

  it('does not emit another user’s notification', async () => {
    const { user } = await seed();
    let emitted = false;
    const sub = service.streamFor('someone-else').subscribe(() => {
      emitted = true;
    });

    await service.sendTest(user.id);
    await new Promise((r) => setTimeout(r, 100));
    sub.unsubscribe();
    expect(emitted).toBe(false);
  });
});

describe('Email channel', () => {
  it('sends an email on fanOut when email is enabled with an address', async () => {
    const ids = await seed();
    await service.upsertSettings(ids.user.id, {
      emailEnabled: true,
      emailAddress: 'owner@example.com',
    });
    const failed = await makeRun(ids, RunStatus.FAILED);

    await service.fanOut({ runId: failed.id, status: 'FAILED' });

    expect(sentMail).toHaveBeenCalledTimes(1);
    expect(sentMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'Run failed' }),
    );
  });

  it('does not send when email is disabled', async () => {
    const ids = await seed();
    const failed = await makeRun(ids, RunStatus.FAILED);

    await service.fanOut({ runId: failed.id, status: 'FAILED' });

    expect(sentMail).not.toHaveBeenCalled();
  });
});
