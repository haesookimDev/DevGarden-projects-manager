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
});
