// Path safety policy used by fs.* tools.
// Every read/write must resolve to a file that is *inside* the project root.
// Symlinks are not followed (callers should not put a symlink that escapes).

import { resolve, sep } from 'node:path';

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathPolicyError';
  }
}

export interface PathPolicy {
  rootDir: string;
}

export function resolveInside(policy: PathPolicy, relPath: string): string {
  if (!policy.rootDir) {
    throw new PathPolicyError('path policy root is not set');
  }
  const root = resolve(policy.rootDir);
  const candidate = resolve(root, relPath);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new PathPolicyError(`path "${relPath}" escapes project root`);
  }
  return candidate;
}
