import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM envelope for secrets persisted to the database.
//
// Wire format (single Bytes column):
//   [ iv (12 bytes) | authTag (16 bytes) | ciphertext (n bytes) ]
//
// Why AES-GCM: authenticated encryption — tampering with the ciphertext
// (or the iv / tag) flips an exception at decrypt time, so we never quietly
// hand back garbage for a row that was modified outside Prisma.
// Why 12-byte IV: NIST SP 800-38D recommended length; required by Node's
// `aes-256-gcm` cipher.
// Why bundle iv + tag with ciphertext: keeps every secret to a single Bytes
// column. Splitting into three columns is more painful to maintain than the
// 28 byte prefix overhead it would save.

const ALGO = 'aes-256-gcm' as const;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

let cachedKey: Buffer | undefined;

export function resetEncryptionKeyCache(): void {
  cachedKey = undefined;
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  // Accept base64 (the format .env.example documents) and fall back to raw
  // utf-8 for operators who prefer a passphrase. The 32-byte requirement
  // applies post-decode.
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    key = Buffer.from(raw, 'utf8');
  }
  if (key.length !== KEY_LEN) {
    // Treat base64 that didn't decode to 32 bytes as utf-8 fallback so a
    // passphrase like 'change-me' still surfaces a length error rather than
    // succeeding silently with a truncated key.
    key = Buffer.from(raw, 'utf8');
  }
  if (key.length !== KEY_LEN) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (current: ${key.length}). ` +
        `Generate with: openssl rand -base64 32`,
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt arbitrary bytes / utf-8 string. Returns the wire-format Buffer. */
export function encryptEnvelope(plaintext: string | Buffer): Buffer {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Decrypt a wire-format Buffer. Throws on integrity failure. */
export function decryptEnvelope(envelope: Buffer): Buffer {
  if (envelope.length < IV_LEN + TAG_LEN) {
    throw new Error('envelope: ciphertext too short');
  }
  const key = loadKey();
  const iv = envelope.subarray(0, IV_LEN);
  const authTag = envelope.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = envelope.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Convenience for the very common case of a utf-8 secret. */
export function decryptEnvelopeUtf8(envelope: Buffer): string {
  return decryptEnvelope(envelope).toString('utf8');
}
