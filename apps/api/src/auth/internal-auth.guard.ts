import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const INTERNAL_HEADER = 'x-internal-secret';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header(INTERNAL_HEADER);
    const expected = process.env.INTERNAL_API_SECRET;

    if (!expected) {
      throw new UnauthorizedException('Server missing INTERNAL_API_SECRET');
    }
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
