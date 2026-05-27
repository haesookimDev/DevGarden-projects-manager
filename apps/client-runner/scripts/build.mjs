// esbuild bundle for the Node sidecar. Produces a single CJS file at
// dist/runner.js so the next-PR work — Tauri's externalBin sidecar
// packaging — only has to ship one JS artifact alongside the prebuilt
// Node binary, instead of dragging a whole node_modules tree.
//
// Bundles every workspace dep (harness-core, shared) into the output;
// keeps Node built-ins external. socket.io-client is bundled too — it's
// small and the alternative is shipping node_modules.

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outFile = resolve(root, 'dist/runner.js');

await mkdir(dirname(outFile), { recursive: true });

const start = Date.now();
await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: outFile,
  // Banner makes the bundle self-runnable: `node dist/runner.js`.
  banner: { js: '#!/usr/bin/env node' },
  // Node built-ins stay external; workspace deps are bundled in.
  external: ['node:*'],
  sourcemap: 'linked',
  legalComments: 'none',
  logLevel: 'info',
});

console.warn(`[client-runner] bundled ${outFile} in ${Date.now() - start}ms`);
