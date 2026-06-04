import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

// Increments dg_http_requests_total on every request the api handles.
// Uses route.path when express has filled it so unbounded /runs/:id style
// paths stay bounded as labels (avoids label cardinality explosion).
// /metrics itself and the SSE stream are excluded to keep the counter
// useful for application traffic.
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { route?: { path: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap({
        next: () => this.count(req, res),
        error: () => this.count(req, res),
      }),
    );
  }

  private count(req: Request & { route?: { path: string } }, res: Response): void {
    const route = req.route?.path ?? req.path ?? 'unknown';
    if (route === '/metrics') return;
    if (route.endsWith('/notifications/stream')) return;
    this.metrics.countHttp(req.method, route, res.statusCode);
  }
}
