import { Injectable } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

// Owns the prom-client Registry + every metric the api exports. P4-4 only
// wires `dg_http_requests_total`; later patches (P4-5) reuse this service
// to register run / notification / sse metrics on the same registry.
@Injectable()
export class MetricsService {
  readonly registry: Registry;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'dg_' });
    this.httpRequestsTotal = new Counter({
      name: 'dg_http_requests_total',
      help: 'Count of HTTP requests handled by the api, labeled by method, route, status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
  }

  countHttp(method: string, route: string, status: number): void {
    this.httpRequestsTotal.inc({ method, route, status: String(status) });
  }

  async render(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
