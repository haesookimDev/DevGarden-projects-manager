// End-to-end webhook receiver test: real http + raw body + HMAC.
// Verifies signature enforcement, idempotency on delivery id, and project
// linkage by `repository.full_name`.

import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const WEBHOOK_SECRET = 'integration-webhook-secret';

const prisma = new PrismaClient();
let app: INestApplication;

beforeAll(async () => {
  await prisma.$connect();
  process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.AUTH_SECRET ??= 'integration-test-secret-with-enough-length-please';
  process.env.INTERNAL_API_SECRET ??= 'integration-test-internal-secret';

  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.todoItem.deleteMany();
  await prisma.githubEvent.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

function sign(body: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
}

describe('POST /webhooks/github', () => {
  it('rejects unsigned requests', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'd1')
      .set('content-type', 'application/json')
      .send({ zen: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong signature', async () => {
    const body = JSON.stringify({ zen: 'hi' });
    const res = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'd-bad')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .set('content-type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('accepts a signed ping and persists an audit row', async () => {
    const body = JSON.stringify({ zen: 'a unicorn rides' });
    const res = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'd-ping-1')
      .set('x-hub-signature-256', sign(body))
      .set('content-type', 'application/json')
      .send(body);
    expect(res.status).toBe(204);

    const row = await prisma.githubEvent.findUnique({ where: { deliveryId: 'd-ping-1' } });
    expect(row?.eventType).toBe('ping');
    expect(row?.projectId).toBeNull();
  });

  it('links event to the matching project via repository.full_name', async () => {
    const user = await prisma.user.create({
      data: { githubId: 8001, login: 'wh-owner', role: UserRole.OWNER },
    });
    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        githubInstallationId: 1,
        githubRepoId: 42,
        repoFullName: 'wh/repo',
        localRoot: '/tmp/wh',
      },
    });
    const body = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'wh/repo' },
      issue: { number: 7, title: 'hi' },
    });
    const res = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'issues')
      .set('x-github-delivery', 'd-iss-1')
      .set('x-hub-signature-256', sign(body))
      .set('content-type', 'application/json')
      .send(body);
    expect(res.status).toBe(204);

    const row = await prisma.githubEvent.findUnique({ where: { deliveryId: 'd-iss-1' } });
    expect(row?.projectId).toBe(project.id);
    expect(row?.repoFullName).toBe('wh/repo');
    expect(row?.action).toBe('opened');
  });

  it('upserts a TodoItem when an issues event arrives for a known project', async () => {
    const user = await prisma.user.create({
      data: { githubId: 8101, login: 'iss-owner', role: UserRole.OWNER },
    });
    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        githubInstallationId: 1,
        githubRepoId: 81,
        repoFullName: 'iss/repo',
        localRoot: '/tmp/iss',
      },
    });

    const open = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'iss/repo' },
      issue: { number: 11, title: 'first', body: 'hi', state: 'open' },
    });
    const r1 = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'issues')
      .set('x-github-delivery', 'd-iss-open-1')
      .set('x-hub-signature-256', sign(open))
      .set('content-type', 'application/json')
      .send(open);
    expect(r1.status).toBe(204);

    const created = await prisma.todoItem.findFirst({
      where: { projectId: project.id, sourceRef: 11 },
    });
    expect(created?.title).toBe('first');
    expect(created?.status).toBe('OPEN');

    const closed = JSON.stringify({
      action: 'closed',
      repository: { full_name: 'iss/repo' },
      issue: { number: 11, title: 'first (closed)', body: 'hi', state: 'closed' },
    });
    const r2 = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-github-event', 'issues')
      .set('x-github-delivery', 'd-iss-close-1')
      .set('x-hub-signature-256', sign(closed))
      .set('content-type', 'application/json')
      .send(closed);
    expect(r2.status).toBe(204);

    const rows = await prisma.todoItem.findMany({
      where: { projectId: project.id, sourceRef: 11 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('DONE');
    expect(rows[0]!.title).toBe('first (closed)');
  });

  it('is idempotent on delivery id', async () => {
    const body = JSON.stringify({ zen: 'duplicate' });
    const headers = {
      'x-github-event': 'ping',
      'x-github-delivery': 'd-dup',
      'x-hub-signature-256': sign(body),
      'content-type': 'application/json',
    };
    const first = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set(headers)
      .send(body);
    const second = await request(app.getHttpServer())
      .post('/webhooks/github')
      .set(headers)
      .send(body);
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    const rows = await prisma.githubEvent.findMany({ where: { deliveryId: 'd-dup' } });
    expect(rows).toHaveLength(1);
  });
});
