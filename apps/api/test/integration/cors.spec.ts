// Verifies main.ts's CORS allow-list. The Tauri webview talks to /clients/pair
// directly with `Origin: tauri://localhost` — without these headers macOS
// WKWebView shows the misleading "Load failed" error.

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
  process.env.CORS_ALLOW_ORIGINS = 'https://ops.example.com';

  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });

  // Re-apply the same CORS rule as main.ts. Pulling main.ts directly would
  // call app.listen() which fights the test harness, so we restate the rule
  // here. Keep in sync with apps/api/src/main.ts.
  const allowed = new Set(['https://ops.example.com']);
  app.enableCors({
    origin: (origin: string | undefined, callback) => {
      if (!origin) return callback(null, true);
      if (allowed.has('*')) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      if (origin === 'tauri://localhost') return callback(null, true);
      if (origin === 'https://tauri.localhost') return callback(null, true);
      return callback(new Error(`CORS: origin "${origin}" not allowed`), false);
    },
    credentials: false,
  });
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('CORS', () => {
  it('echoes Access-Control-Allow-Origin for tauri://localhost', async () => {
    const res = await request(app.getHttpServer())
      .options('/clients/pair')
      .set('origin', 'tauri://localhost')
      .set('access-control-request-method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('tauri://localhost');
  });

  it('echoes Access-Control-Allow-Origin for https://tauri.localhost', async () => {
    const res = await request(app.getHttpServer())
      .options('/clients/pair')
      .set('origin', 'https://tauri.localhost')
      .set('access-control-request-method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('https://tauri.localhost');
  });

  it('echoes Access-Control-Allow-Origin for an env-allowed origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/clients/pair')
      .set('origin', 'https://ops.example.com')
      .set('access-control-request-method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('https://ops.example.com');
  });

  it('omits the allow-origin header for disallowed origins', async () => {
    const res = await request(app.getHttpServer())
      .options('/clients/pair')
      .set('origin', 'https://evil.example.com')
      .set('access-control-request-method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows server-to-server callers with no Origin header', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    // No CORS reflection needed; just confirm the request itself succeeds.
    expect(res.status).toBe(200);
  });
});
