// HMAC SHA-256 verification for GitHub webhooks.
// GitHub signs the raw body with the configured secret and sends it in the
// `X-Hub-Signature-256: sha256=<hex>` header.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyGithubSignatureInput {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
}

export function verifyGithubSignature(input: VerifyGithubSignatureInput): boolean {
  const { rawBody, signatureHeader, secret } = input;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  if (!secret) return false;

  const provided = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}
