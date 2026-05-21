import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// unplugin-swc ships against a newer vite major than vitest currently bundles.
// The shape is fine — cast to silence the structural mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const swcPlugin = swc.vite({
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { decoratorMetadata: true, legacyDecorator: true },
  },
}) as unknown as never;

export default defineConfig({
  plugins: [
    // NestJS DI relies on emitDecoratorMetadata. vitest's default esbuild
    // transformer drops it, so swap in swc which preserves it.
    swcPlugin,
  ],
  test: {
    include: ['test/integration/**/*.spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Tests share a single Testcontainers Postgres. Run files serially so one
    // file's `beforeEach` cleanup never races with another's `afterEach`.
    fileParallelism: false,
  },
});
