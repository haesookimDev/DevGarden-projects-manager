import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptEnvelope,
  decryptEnvelopeUtf8,
  encryptEnvelope,
  resetEncryptionKeyCache,
} from './envelope';

// Helper: deterministic 32-byte base64 key for the suite.
const TEST_KEY_B64 = randomBytes(32).toString('base64');

describe('envelope encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    resetEncryptionKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
    resetEncryptionKeyCache();
  });

  it('round-trips a utf-8 secret', () => {
    const secret = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n';
    const env = encryptEnvelope(secret);
    expect(env.length).toBeGreaterThan(28); // iv + tag + at least some bytes
    expect(decryptEnvelopeUtf8(env)).toBe(secret);
  });

  it('round-trips arbitrary bytes', () => {
    const secret = randomBytes(64);
    const env = encryptEnvelope(secret);
    expect(decryptEnvelope(env).equals(secret)).toBe(true);
  });

  it('emits a fresh IV each call so two encryptions of the same plaintext differ', () => {
    const a = encryptEnvelope('same');
    const b = encryptEnvelope('same');
    expect(a.equals(b)).toBe(false);
    expect(decryptEnvelopeUtf8(a)).toBe('same');
    expect(decryptEnvelopeUtf8(b)).toBe('same');
  });

  it('rejects tampered ciphertext via the auth tag', () => {
    const env = Buffer.from(encryptEnvelope('important')); // copy so we can mutate
    // Flip a byte inside the ciphertext region.
    env[env.length - 1] = env[env.length - 1]! ^ 0xff;
    expect(() => decryptEnvelope(env)).toThrow();
  });

  it('rejects an envelope that is too short to hold an IV + auth tag', () => {
    expect(() => decryptEnvelope(Buffer.alloc(10))).toThrow(/too short/);
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'change-me'; // 9-byte passphrase
    resetEncryptionKeyCache();
    expect(() => encryptEnvelope('x')).toThrow(/must decode to 32 bytes/);
  });

  it('throws a clear error when ENCRYPTION_KEY is unset', () => {
    delete process.env.ENCRYPTION_KEY;
    resetEncryptionKeyCache();
    expect(() => encryptEnvelope('x')).toThrow(/is not set/);
  });
});
