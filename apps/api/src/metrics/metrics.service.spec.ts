import { beforeEach, describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
  });

  it('exposes a prom registry rendered as text', async () => {
    const { contentType, body } = await svc.render();
    expect(contentType).toMatch(/text\/plain/);
    expect(body).toContain('dg_http_requests_total');
  });

  it('increments dg_http_requests_total per labelset', async () => {
    svc.countHttp('GET', '/runs', 200);
    svc.countHttp('GET', '/runs', 200);
    svc.countHttp('POST', '/runs', 201);
    const { body } = await svc.render();
    expect(body).toContain('dg_http_requests_total{method="GET",route="/runs",status="200"} 2');
    expect(body).toContain('dg_http_requests_total{method="POST",route="/runs",status="201"} 1');
  });

  it('increments dg_run_status_total per status', async () => {
    svc.countRunStatus('QUEUED');
    svc.countRunStatus('SUCCESS');
    svc.countRunStatus('SUCCESS');
    const { body } = await svc.render();
    expect(body).toContain('dg_run_status_total{status="QUEUED"} 1');
    expect(body).toContain('dg_run_status_total{status="SUCCESS"} 2');
  });

  it('increments dg_notification_delivered_total per channel', async () => {
    svc.countNotification('webToast');
    svc.countNotification('slack');
    svc.countNotification('slack');
    const { body } = await svc.render();
    expect(body).toContain('dg_notification_delivered_total{channel="webToast"} 1');
    expect(body).toContain('dg_notification_delivered_total{channel="slack"} 2');
  });

  it('tracks dg_notification_sse_clients via inc/dec', async () => {
    svc.sseClientConnected();
    svc.sseClientConnected();
    svc.sseClientDisconnected();
    const { body } = await svc.render();
    expect(body).toMatch(/dg_notification_sse_clients\s+1/);
  });
});
