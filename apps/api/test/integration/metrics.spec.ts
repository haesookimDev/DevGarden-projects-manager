// Validates the /metrics endpoint exposes prometheus text, enforces the
// shared internal-secret auth (or METRICS_PUBLIC opt-in), and ticks the
// dg_http_requests_total counter when other requests land.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const prisma = new PrismaClient();
let app: INestApplication;

const INTERNAL_SECRET = 'integration-test-internal-secret-metrics';

beforeAll(async () => {
  await prisma.$connect();
  process.env.AUTH_SECRET ??= 'integration-test-secret-with-enough-length-please';
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  delete process.env.METRICS_PUBLIC;

  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  delete process.env.METRICS_PUBLIC;
});

describe('GET /metrics', () => {
  it('rejects requests without the internal secret header', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('returns prometheus text when the internal secret matches', async () => {
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('x-internal-secret', INTERNAL_SECRET);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('dg_http_requests_total');
  });

  it('allows unauthenticated scrape when METRICS_PUBLIC=true', async () => {
    process.env.METRICS_PUBLIC = 'true';
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dg_http_requests_total');
  });

  it('counts other http requests in dg_http_requests_total', async () => {
    await request(app.getHttpServer()).get('/healthz');
    await request(app.getHttpServer()).get('/healthz');
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('x-internal-secret', INTERNAL_SECRET);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      /dg_http_requests_total\{method="GET",route="\/healthz",status="200"\}\s+\d+/,
    );
  });
});
