// Copies the freshly-built sidecar bundle into the Tauri resource dir so
// `bundle.resources` in tauri.conf.json picks it up at packaging time and
// the Rust side can resolve it via `app.path().resource_dir()`.
//
// Run by the client's tauri scripts (tauri:dev / tauri:build) before the
// Tauri CLI itself, so dist/runner.js is always current.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const src = resolve(root, '../client-runner/dist/runner.js');
const dst = resolve(root, 'src-tauri/resources/runner.js');

try {
  await stat(src);
} catch {
  console.error(
    `[copy-runner] sidecar bundle not found at ${src}. ` +
      `Run \`pnpm --filter @devgarden/client-runner build\` first ` +
      `(or use \`pnpm tauri:dev\` / \`pnpm tauri:build\` which chain it).`,
  );
  process.exit(1);
}

await mkdir(dirname(dst), { recursive: true });
await copyFile(src, dst);
const { size } = await stat(dst);
console.warn(`[copy-runner] copied ${src} → ${dst} (${size} bytes)`);
