import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

// Short-lived store for the manifest flow's `state` parameter, used to bind a
// GitHub-side App creation back to the owner who initiated it.
//
// Lifetime is intentionally in-process: the manifest flow takes 30-60s end
// to end and the api is single-process. If/when we shard the api this
// migrates to a DB-backed model (the state row is tiny — single SELECT for
// callback).

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface Pending {
  ownerId: string;
  createdAt: number;
}

@Injectable()
export class ManifestStateService {
  private readonly pending = new Map<string, Pending>();

  // Mutable so tests can shrink the TTL without a constructor parameter
  // (NestJS DI would otherwise try to resolve the primitive as a provider
  // and fail with "Nest can't resolve dependencies of ManifestStateService").
  ttlMs: number = DEFAULT_TTL_MS;

  /** Generate + remember a fresh state token tied to an owner. */
  issue(ownerId: string, now: number = Date.now()): string {
    this.sweep(now);
    const state = randomBytes(24).toString('base64url');
    this.pending.set(state, { ownerId, createdAt: now });
    return state;
  }

  /**
   * Consume the state token, returning the bound ownerId on success.
   * Returns null on miss or expiry — callers should treat both identically
   * (the security model is "you don't get to retry with the same token").
   */
  consume(state: string, now: number = Date.now()): string | null {
    this.sweep(now);
    const row = this.pending.get(state);
    if (!row) return null;
    this.pending.delete(state);
    if (now - row.createdAt > this.ttlMs) return null;
    return row.ownerId;
  }

  /** Test seam — drop the in-memory map. */
  clearForTest(): void {
    this.pending.clear();
  }

  private sweep(now: number): void {
    const cutoff = now - this.ttlMs;
    for (const [k, v] of this.pending) {
      if (v.createdAt < cutoff) this.pending.delete(k);
    }
  }
}
