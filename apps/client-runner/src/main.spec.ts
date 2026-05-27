import { describe, expect, it } from 'vitest';

// Placeholder smoke for the sidecar bundle. Until PR3 adds the real
// stdin bootstrap there's nothing structural to assert beyond
// "the module imports cleanly" — but having a spec means CI's unit
// stage includes apps/client-runner from day one, so subsequent PRs
// can grow the suite without scaffolding it on top of zero.
describe('client-runner', () => {
  it('main module imports without throwing', async () => {
    // Dynamic import — the module's top-level main() writes to stdout
    // on load, which is harmless in vitest. If the build pipeline ever
    // emits an unrunnable bundle this test catches it before CI.
    await expect(import('./main')).resolves.toBeDefined();
  });
});
