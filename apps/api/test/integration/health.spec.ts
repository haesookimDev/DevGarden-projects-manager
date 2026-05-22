// Validates that liveness (/healthz) and readiness (/healthz/ready) endpoints
// behave as expected against a live Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const prisma = new PrismaClient();
let app: INestApplication;

beforeAll(async () => {
  await prisma.$connect();
  process.env.AUTH_SECRET ??= 'integration-test-secret-with-enough-length-please';
  process.env.INTERNAL_API_SECRET ??= 'integration-test-internal-secret';

  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('health endpoints', () => {
  it('GET /healthz returns 200 ok without auth', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /healthz/ready returns 200 when the DB is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/healthz/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('reachable');
  });
});
