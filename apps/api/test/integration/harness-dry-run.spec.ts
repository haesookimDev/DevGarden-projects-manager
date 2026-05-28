// Wire-level test for the N4 dry-run endpoints:
//   POST /internal/harnesses/dry-run     — body { yaml | definition, inputs }
//   POST /internal/harnesses/:id/dry-run — loads the saved harness first

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { HarnessDryRunService } from '../../src/harnesses/harness-dry-run.service';
import { HarnessesInternalController } from '../../src/harnesses/harnesses.internal.controller';
import { HarnessesService } from '../../src/harnesses/harnesses.service';
import { PrismaModule } from '../../src/prisma/prisma.module';

const prisma = new PrismaClient();

let app: INestApplication;

beforeAll(async () => {
  await prisma.$connect();
  process.env.INTERNAL_API_SECRET = 'dry-run-test-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
    controllers: [HarnessesInternalController],
    providers: [HarnessesService, HarnessDryRunService],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear the run chain before harnesses — HarnessRun.harnessId is
  // onDelete: Restrict, so leftovers from a prior spec file (shared
  // Postgres, serial run) would block harness.deleteMany.
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.runPreset.deleteMany();
  await prisma.client.deleteMany();
  await prisma.project.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.user.deleteMany();
});

const echoYaml = `
name: echo
version: 1
steps:
  - id: greet
    type: tool
    use: fs.write
    with:
      path: 'a.txt'
      content: 'hi'
  - id: think
    type: llm
    prompt: |
      summarize \${steps.greet.path}
`;

describe('POST /internal/harnesses/dry-run', () => {
  it('returns ok:true with step results, llm calls, and tool calls for a valid yaml', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/dry-run')
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({ yaml: echoYaml });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.harness).toMatchObject({ name: 'echo', version: 1 });
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[0]).toMatchObject({ stepId: 'greet', status: 'success' });
    expect(res.body.steps[1]).toMatchObject({ stepId: 'think', status: 'success' });
    expect(res.body.toolCalls).toEqual([
      { stepId: 'greet', tool: 'fs.write', input: { path: 'a.txt', content: 'hi' } },
    ]);
    expect(res.body.llmCalls).toHaveLength(1);
    expect(res.body.llmCalls[0].stepId).toBe('think');
    // Interpolation happened — the prompt resolves the steps.greet reference
    // against the recording handler's echo output.
    expect(res.body.llmCalls[0].prompt).toContain('a.txt');
  });

  it('returns ok:false / kind:parse with issues for invalid yaml', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/dry-run')
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({
        yaml: `
name: bad
version: 1
steps:
  - id: '?'
    type: unknown-kind
`,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(false);
    expect(res.body.kind).toBe('parse');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('accepts a definition object instead of yaml', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/dry-run')
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({
        definition: {
          name: 'inline',
          version: 1,
          steps: [{ id: 'go', type: 'tool', use: 'fs.read', with: { path: 'README.md' } }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.harness.name).toBe('inline');
    expect(res.body.toolCalls).toEqual([
      { stepId: 'go', tool: 'fs.read', input: { path: 'README.md' } },
    ]);
  });

  it('rejects a request with neither yaml nor definition with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/dry-run')
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects requests without the internal secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/dry-run')
      .send({ yaml: echoYaml });
    expect(res.status).toBe(401);
  });
});

describe('POST /internal/harnesses/:id/dry-run', () => {
  it('loads the saved harness and dry-runs its definition', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 5500, login: 'dr-owner', role: UserRole.OWNER },
    });
    const row = await prisma.harness.create({
      data: {
        ownerId: owner.id,
        name: 'echo',
        version: 1,
        definition: {
          name: 'echo',
          version: 1,
          steps: [{ id: 'go', type: 'tool', use: 'fs.read', with: { path: 'a.txt' } }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/internal/harnesses/${row.id}/dry-run`)
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({ inputs: { foo: 'bar' } });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.harness.name).toBe('echo');
    expect(res.body.toolCalls).toEqual([
      { stepId: 'go', tool: 'fs.read', input: { path: 'a.txt' } },
    ]);
  });

  it('returns 404 for an unknown harness id', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/harnesses/missing/dry-run')
      .set('x-internal-secret', 'dry-run-test-secret')
      .send({});
    expect(res.status).toBe(404);
  });
});
