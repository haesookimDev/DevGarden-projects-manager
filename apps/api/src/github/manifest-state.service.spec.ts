import { describe, expect, it } from 'vitest';

import { ManifestStateService } from './manifest-state.service';

describe('ManifestStateService', () => {
  it('issues a unique state per call and consume returns the bound ownerId once', () => {
    const svc = new ManifestStateService();
    const a = svc.issue('user_1');
    const b = svc.issue('user_1');
    expect(a).not.toBe(b);

    expect(svc.consume(a)).toBe('user_1');
    // Second consume of the same token must miss — protects against replay.
    expect(svc.consume(a)).toBeNull();
    // Other token still valid.
    expect(svc.consume(b)).toBe('user_1');
  });

  it('returns null for an unknown state', () => {
    const svc = new ManifestStateService();
    expect(svc.consume('never-issued')).toBeNull();
  });

  it('expires entries past the TTL', () => {
    const svc = new ManifestStateService(1_000);
    const t0 = 1_000_000_000;
    const state = svc.issue('user_1', t0);
    expect(svc.consume(state, t0 + 999)).toBe('user_1');

    const next = svc.issue('user_1', t0 + 999);
    expect(svc.consume(next, t0 + 2_500)).toBeNull();
  });
});
