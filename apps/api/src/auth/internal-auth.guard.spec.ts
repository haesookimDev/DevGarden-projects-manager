import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InternalAuthGuard } from './internal-auth.guard';

function makeContext(header: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'x-internal-secret' ? header : undefined),
      }),
    }),
  } as never;
}

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard();
  const originalSecret = process.env.INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = 'super-secret-value';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = originalSecret;
    }
  });

  it('allows requests with matching secret', () => {
    expect(guard.canActivate(makeContext('super-secret-value'))).toBe(true);
  });

  it('rejects missing header', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });

  it('rejects mismatched secret', () => {
    expect(() => guard.canActivate(makeContext('wrong'))).toThrow(UnauthorizedException);
  });

  it('rejects when server env is not configured', () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(() => guard.canActivate(makeContext('anything'))).toThrow(UnauthorizedException);
  });

  it('rejects same-prefix but different length secret', () => {
    expect(() => guard.canActivate(makeContext('super-secret'))).toThrow(UnauthorizedException);
  });
});
