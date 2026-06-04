import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const INTERNAL_HEADER = 'x-internal-secret';

// Independent of InternalAuthGuard so a misconfigured INTERNAL_API_SECRET
// can't accidentally make /metrics throw 500. METRICS_PUBLIC=true lets the
// operator opt into anonymous scraping (intended for a private Prometheus
// network); otherwise the same x-internal-secret header used elsewhere.
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.METRICS_PUBLIC === 'true') return true;

    const expected = process.env.INTERNAL_API_SECRET;
    if (!expected) {
      throw new UnauthorizedException(
        'Metrics auth requires INTERNAL_API_SECRET or METRICS_PUBLIC=true',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header(INTERNAL_HEADER);
    if (!provided) {
      throw new UnauthorizedException(`Missing ${INTERNAL_HEADER} header`);
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    return true;
  }
}
