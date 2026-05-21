import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientJwtService } from './client-jwt.service';

const originalSecret = process.env.AUTH_SECRET;

function restoreSecret() {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
}

describe('ClientJwtService', () => {
  const svc = new ClientJwtService();

  beforeEach(() => {
    process.env.AUTH_SECRET = 'unit-test-secret-with-enough-length-for-hs256';
  });

  afterEach(() => {
    restoreSecret();
  });

  it('round-trips a valid payload', async () => {
    const jwt = await svc.sign({ clientId: 'client-1', ownerId: 'owner-1' });
    const payload = await svc.verify(jwt);
    expect(payload).toEqual({ clientId: 'client-1', ownerId: 'owner-1' });
  });

  it('rejects a token signed with a different secret', async () => {
    const jwt = await svc.sign({ clientId: 'c', ownerId: 'o' });
    process.env.AUTH_SECRET = 'a-different-secret-with-enough-length-for-hs256';
    await expect(svc.verify(jwt)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects garbage', async () => {
    await expect(svc.verify('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws InternalServerErrorException when AUTH_SECRET is missing during sign', async () => {
    delete process.env.AUTH_SECRET;
    await expect(svc.sign({ clientId: 'c', ownerId: 'o' })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('rejects an expired token', async () => {
    const jwt = await svc.sign({ clientId: 'c', ownerId: 'o' }, 1);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(svc.verify(jwt)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
