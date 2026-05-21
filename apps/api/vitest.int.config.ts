import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    // NestJS DI relies on emitDecoratorMetadata. vitest's default esbuild
    // transformer drops it, so swap in swc which preserves it.
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
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
  },
});
