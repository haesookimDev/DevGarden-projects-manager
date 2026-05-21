import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGithubSignature } from './github-hmac';

const SECRET = 'webhook-secret-for-tests';

function sign(body: Buffer): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  it('accepts a correctly-signed payload', () => {
    const body = Buffer.from(JSON.stringify({ a: 1 }));
    expect(
      verifyGithubSignature({ rawBody: body, signatureHeader: sign(body), secret: SECRET }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ a: 1 }));
    const sig = sign(body);
    const tampered = Buffer.from(JSON.stringify({ a: 2 }));
    expect(verifyGithubSignature({ rawBody: tampered, signatureHeader: sig, secret: SECRET })).toBe(
      false,
    );
  });

  it('rejects when secret mismatches', () => {
    const body = Buffer.from(JSON.stringify({ a: 1 }));
    expect(
      verifyGithubSignature({ rawBody: body, signatureHeader: sign(body), secret: 'other-secret' }),
    ).toBe(false);
  });

  it('rejects when header is missing or malformed', () => {
    const body = Buffer.from('x');
    expect(
      verifyGithubSignature({ rawBody: body, signatureHeader: undefined, secret: SECRET }),
    ).toBe(false);
    expect(
      verifyGithubSignature({ rawBody: body, signatureHeader: 'sha1=abc', secret: SECRET }),
    ).toBe(false);
  });

  it('rejects when secret is empty', () => {
    const body = Buffer.from('x');
    expect(verifyGithubSignature({ rawBody: body, signatureHeader: sign(body), secret: '' })).toBe(
      false,
    );
  });
});
