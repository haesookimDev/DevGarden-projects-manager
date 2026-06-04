// Focused unit test for the metrics hooks added to NotificationService in P4-5.
// The full deliverAll/fanOut paths are covered by the integration suite; here
// we verify the structural wiring: subscribing to streamFor() bumps the SSE
// gauge, and tearing down decrements it again.

import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationService } from './notifications.service';

describe('NotificationService SSE gauge', () => {
  it('inc/dec dg_notification_sse_clients on subscribe/teardown', () => {
    const metrics = new MetricsService();
    // Cast to access the @Optional-injected field via the constructor.
    const svc = new NotificationService(
      {} as never, // prisma — unused for streamFor
      {} as never, // slack — unused
      {} as never, // email — unused
      metrics,
    );
    const incSpy = vi.spyOn(metrics, 'sseClientConnected');
    const decSpy = vi.spyOn(metrics, 'sseClientDisconnected');
    const sub = svc.streamFor('user-1').subscribe();
    expect(incSpy).toHaveBeenCalledOnce();
    expect(decSpy).not.toHaveBeenCalled();
    sub.unsubscribe();
    expect(decSpy).toHaveBeenCalledOnce();
  });

  it('routes only matching userId events through the gauge-wrapped stream', () => {
    const metrics = new MetricsService();
    const svc = new NotificationService({} as never, {} as never, {} as never, metrics);
    // Reach into the private subject so we can push events without going
    // through the full deliverAll persistence path.
    const subject = (
      svc as unknown as { stream$: Subject<{ userId: string; notification: { id: string } }> }
    ).stream$;
    const received: { id: string }[] = [];
    svc.streamFor('user-1').subscribe((n) => received.push(n as unknown as { id: string }));
    subject.next({ userId: 'user-1', notification: { id: 'a' } });
    subject.next({ userId: 'user-2', notification: { id: 'b' } });
    subject.next({ userId: 'user-1', notification: { id: 'c' } });
    expect(received.map((n) => n.id)).toEqual(['a', 'c']);
  });
});
