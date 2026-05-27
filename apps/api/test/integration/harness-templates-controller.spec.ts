// Wire-level test for the harness-templates catalog endpoint. The catalog
// itself is covered by the package's own unit tests (packages/
// harness-templates/src/index.spec.ts) — this suite focuses on:
//   - auth gating
//   - the HTTP surface returning what listTemplatesMeta() / getTemplate()
//     would return
//   - 404 for unknown id

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HarnessTemplatesController } from '../../src/harnesses/harness-templates.controller';

let app: INestApplication;

beforeAll(async () => {
  process.env.INTERNAL_API_SECRET = 'templates-test-secret';
  const moduleRef = await Test.createTestingModule({
    controllers: [HarnessTemplatesController],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('GET /internal/harness-templates', () => {
  it('returns the catalog metadata for all 5 shipped templates', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/harness-templates')
      .set('x-internal-secret', 'templates-test-secret');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    const ids = res.body.map((t: { id: string }) => t.id).sort();
    expect(ids).toEqual([
      'auto-fix-issue',
      'dependency-upgrade',
      'pr-review',
      'release-notes',
      'test-runner',
    ]);
    for (const entry of res.body) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.tags)).toBe(true);
      // Metadata-only endpoint must not include the yaml body.
      expect(entry).not.toHaveProperty('yaml');
    }
  });

  it('rejects requests without the internal secret', async () => {
    const res = await request(app.getHttpServer()).get('/internal/harness-templates');
    expect(res.status).toBe(401);
  });
});

describe('GET /internal/harness-templates/:id', () => {
  it('returns the full template with yaml body', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/harness-templates/auto-fix-issue')
      .set('x-internal-secret', 'templates-test-secret');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('auto-fix-issue');
    expect(res.body.title.length).toBeGreaterThan(0);
    expect(typeof res.body.yaml).toBe('string');
    expect(res.body.yaml).toMatch(/^name: 'auto-fix-issue'$/m);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/harness-templates/nope')
      .set('x-internal-secret', 'templates-test-secret');
    expect(res.status).toBe(404);
  });
});
