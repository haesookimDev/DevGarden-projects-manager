import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

// Owns the prom-client Registry + every metric the api exports.
// Names + labels are stable contracts for operators' dashboards — do not
// rename them lightly.
@Injectable()
export class MetricsService {
  readonly registry: Registry;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  readonly runStatusTotal: Counter<'status'>;
  readonly notificationDeliveredTotal: Counter<'channel'>;
  readonly notificationSseClients: Gauge<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'dg_' });
    this.httpRequestsTotal = new Counter({
      name: 'dg_http_requests_total',
      help: 'Count of HTTP requests handled by the api, labeled by method, route, status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.runStatusTotal = new Counter({
      name: 'dg_run_status_total',
      help: 'Count of run-status writes, labeled by status. Counts state transitions, not unique runs.',
      labelNames: ['status'],
      registers: [this.registry],
    });
    this.notificationDeliveredTotal = new Counter({
      name: 'dg_notification_delivered_total',
      help: 'Count of notification deliveries, labeled by channel (webToast/slack/email).',
      labelNames: ['channel'],
      registers: [this.registry],
    });
    this.notificationSseClients = new Gauge({
      name: 'dg_notification_sse_clients',
      help: 'Number of notification SSE clients currently subscribed (per api instance).',
      registers: [this.registry],
    });
  }

  countHttp(method: string, route: string, status: number): void {
    this.httpRequestsTotal.inc({ method, route, status: String(status) });
  }

  countRunStatus(status: string): void {
    this.runStatusTotal.inc({ status });
  }

  countNotification(channel: 'webToast' | 'slack' | 'email'): void {
    this.notificationDeliveredTotal.inc({ channel });
  }

  sseClientConnected(): void {
    this.notificationSseClients.inc();
  }

  sseClientDisconnected(): void {
    this.notificationSseClients.dec();
  }

  async render(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
