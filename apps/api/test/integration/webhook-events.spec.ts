// Integration tests for WebhookEventsService — N6 webhook audit listing +
// redeliver. The redeliver path uses a structurally-typed fake octokit so no
// network call escapes the suite.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  WebhookEventsService,
  type WebhookOctokit,
} from '../../src/webhooks/webhook-events.service';
import { GithubAppService } from '../../src/github/github-app.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();
const svc = new WebhookEventsService(
  prisma as unknown as PrismaService,
  // appOctokit is overridden per-test via the redeliver override arg, so the
  // injected GithubAppService is never actually called.
  {} as unknown as GithubAppService,
);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.githubEvent.deleteMany();
});

async function seedEvents() {
  const base = Date.parse('2026-05-01T00:00:00Z');
  await prisma.githubEvent.createMany({
    data: [
      {
        deliveryId: 'guid-push-1',
        eventType: 'push',
        action: null,
        repoFullName: 'o/a',
        payload: { ref: 'refs/heads/main' },
        receivedAt: new Date(base + 3000),
      },
      {
        deliveryId: 'guid-issues-1',
        eventType: 'issues',
        action: 'opened',
        repoFullName: 'o/a',
        payload: { issue: { number: 1 } },
        receivedAt: new Date(base + 2000),
      },
      {
        deliveryId: 'guid-issues-2',
        eventType: 'issues',
        action: 'closed',
        repoFullName: 'o/b',
        payload: { issue: { number: 2 } },
        receivedAt: new Date(base + 1000),
      },
    ],
  });
}

describe('WebhookEventsService.listEvents', () => {
  it('lists all events newest-first without payload', async () => {
    await seedEvents();
    const rows = await svc.listEvents({});
    expect(rows.map((r) => r.deliveryId)).toEqual([
      'guid-push-1',
      'guid-issues-1',
      'guid-issues-2',
    ]);
    expect(rows[0]).not.toHaveProperty('payload');
  });

  it('filters by eventType', async () => {
    await seedEvents();
    const rows = await svc.listEvents({ eventType: 'issues' });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.eventType === 'issues')).toBe(true);
  });

  it('filters by since', async () => {
    await seedEvents();
    const rows = await svc.listEvents({ since: new Date('2026-05-01T00:00:02.5Z') });
    expect(rows.map((r) => r.deliveryId)).toEqual(['guid-push-1']);
  });

  it('respects pageSize', async () => {
    await seedEvents();
    const rows = await svc.listEvents({ pageSize: 2 });
    expect(rows).toHaveLength(2);
  });
});

describe('WebhookEventsService.getEvent', () => {
  it('returns a single event including payload', async () => {
    await seedEvents();
    const all = await svc.listEvents({});
    const full = await svc.getEvent(all[0]!.id);
    expect(full.payload).toBeTruthy();
  });

  it('throws NotFoundException for unknown id', async () => {
    await expect(svc.getEvent('missing')).rejects.toThrow(/not found/);
  });
});

describe('WebhookEventsService.redeliver', () => {
  it('matches the stored guid to the numeric delivery id and redelivers', async () => {
    await seedEvents();
    const all = await svc.listEvents({});
    const target = all.find((r) => r.deliveryId === 'guid-push-1')!;

    const redeliverSpy = vi.fn().mockResolvedValue({});
    const fakeOctokit: WebhookOctokit = {
      apps: {
        listWebhookDeliveries: vi.fn().mockResolvedValue({
          data: [
            { id: 111, guid: 'some-other-guid' },
            { id: 222, guid: 'guid-push-1' },
          ],
        }),
        redeliverWebhookDelivery: redeliverSpy,
      },
    };

    const res = await svc.redeliver(target.id, fakeOctokit);
    expect(res).toEqual({ ok: true, deliveryId: 222 });
    expect(redeliverSpy).toHaveBeenCalledWith({ delivery_id: 222 });
  });

  it('returns not-found-on-github when no delivery matches the guid', async () => {
    await seedEvents();
    const all = await svc.listEvents({});
    const target = all[0]!;
    const fakeOctokit: WebhookOctokit = {
      apps: {
        listWebhookDeliveries: vi.fn().mockResolvedValue({ data: [{ id: 1, guid: 'nope' }] }),
        redeliverWebhookDelivery: vi.fn(),
      },
    };
    const res = await svc.redeliver(target.id, fakeOctokit);
    expect(res).toMatchObject({ ok: false, reason: 'not-found-on-github' });
  });

  it('throws NotFoundException when the event id is unknown', async () => {
    const fakeOctokit: WebhookOctokit = {
      apps: {
        listWebhookDeliveries: vi.fn(),
        redeliverWebhookDelivery: vi.fn(),
      },
    };
    await expect(svc.redeliver('missing', fakeOctokit)).rejects.toThrow(/not found/);
  });
});
