// Verifies the Redis pub/sub path added in P1-2:
//   - REDIS_PUBLISHER unset: deliverWebToast emits directly to the local stream
//     (single-instance fallback, identical to the pre-P1 behavior).
//   - REDIS_PUBLISHER set: deliverWebToast publishes to NOTIF_CHANNEL and does
//     NOT directly call stream$.next() (avoiding the double-emit on the origin
//     instance — the subscribe handler is the single source of truth).
//   - subscribe handler relays a published payload through stream$ to streamFor.

import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notifications.service';

interface RedisStub {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

function makeSubStub(): RedisStub & {
  trigger: (channel: string, payload: string) => void;
} {
  let messageHandler: ((channel: string, payload: string) => void) | null = null;
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, cb: (channel: string, payload: string) => void) => {
      if (event === 'message') messageHandler = cb;
    }),
    trigger: (channel, payload) => messageHandler?.(channel, payload),
  };
}

function makeService(opts: {
  pub?: RedisStub | null;
  sub?: (RedisStub & { trigger: (c: string, p: string) => void }) | null;
}): NotificationService {
  const prisma = {
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'n-1',
        createdAt: new Date('2026-06-04T00:00:00Z'),
        readAt: null,
        runId: null,
        body: null,
        ...data,
      })),
    },
  } as never;
  return new NotificationService(
    prisma,
    {} as never,
    {} as never,
    undefined,
    opts.pub as never,
    opts.sub as never,
  );
}

describe('NotificationService Redis pub/sub', () => {
  it('falls back to in-process stream$ when REDIS_PUBLISHER is null', async () => {
    const svc = makeService({});
    const received: unknown[] = [];
    svc.streamFor('user-1').subscribe((n) => received.push(n));
    // private — invoke through fanOut-equivalent path: deliverWebToast is private
    // so reach through the public stream by simulating what fanOut's deliverAll
    // does (it calls deliverWebToast then bumps the metric counter). We call the
    // private method directly via cast since this is purely a routing test.
    await (
      svc as unknown as { deliverWebToast: (u: string, n: object) => Promise<unknown> }
    ).deliverWebToast('user-1', { kind: 'run.success', title: 't', runId: undefined });
    expect(received).toHaveLength(1);
  });

  it('publishes to dg:notif when REDIS_PUBLISHER is wired (no direct stream emit)', async () => {
    const pub = { publish: vi.fn().mockResolvedValue(1), subscribe: vi.fn(), on: vi.fn() };
    const svc = makeService({ pub });
    const received: unknown[] = [];
    svc.streamFor('user-1').subscribe((n) => received.push(n));
    await (
      svc as unknown as { deliverWebToast: (u: string, n: object) => Promise<unknown> }
    ).deliverWebToast('user-1', { kind: 'run.success', title: 't' });
    expect(pub.publish).toHaveBeenCalledWith(
      'dg:notif',
      expect.stringContaining('"userId":"user-1"'),
    );
    // Critical: the origin instance did NOT also emit directly — the subscribe
    // handler is the single source of truth.
    expect(received).toHaveLength(0);
  });

  it('routes redis pmessage through stream$ to streamFor', async () => {
    const sub = makeSubStub();
    const svc = makeService({ sub });
    await svc.onModuleInit();
    expect(sub.subscribe).toHaveBeenCalledWith('dg:notif');
    const received: { id: string }[] = [];
    svc.streamFor('user-1').subscribe((n) => received.push(n as unknown as { id: string }));
    sub.trigger('dg:notif', JSON.stringify({ userId: 'user-1', notification: { id: 'remote-1' } }));
    sub.trigger('dg:notif', JSON.stringify({ userId: 'user-2', notification: { id: 'remote-2' } }));
    expect(received.map((n) => n.id)).toEqual(['remote-1']);
  });
});
