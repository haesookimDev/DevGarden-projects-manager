// fs.read / fs.write / fs.list tools. All paths are forced inside the
// project root via PathPolicy.

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ToolHandler } from '@devgarden/harness-core';
import { resolveInside, type PathPolicy } from './path-policy';

export function makeFsTools(policy: PathPolicy): ToolHandler[] {
  return [
    {
      name: 'fs.read',
      async run(input) {
        const path = requireString(input, 'path');
        const abs = resolveInside(policy, path);
        const content = await readFile(abs, 'utf8');
        return { path, content };
      },
    },
    {
      name: 'fs.write',
      async run(input) {
        const path = requireString(input, 'path');
        const content = requireString(input, 'content');
        const abs = resolveInside(policy, path);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content, 'utf8');
        return { path, bytes: Buffer.byteLength(content, 'utf8') };
      },
    },
    {
      name: 'fs.list',
      async run(input) {
        const path = requireString(input, 'path');
        const abs = resolveInside(policy, path);
        const entries = await readdir(abs);
        const out = await Promise.all(
          entries.map(async (name) => {
            const info = await stat(resolveInside(policy, `${path}/${name}`));
            return { name, isDirectory: info.isDirectory(), size: info.size };
          }),
        );
        return { path, entries: out };
      },
    },
  ];
}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string') throw new Error(`fs tool: "${key}" must be a string`);
  return v;
}
