import type { ToolHandler } from '@devgarden/harness-core';
import { makeFsTools } from './fs';
import { makeGitTools } from './git';
import { makeProcessTool } from './process';
import type { PathPolicy } from './path-policy';

export interface ToolRegistryOptions {
  policy: PathPolicy;
  processAllowList: ReadonlyArray<string>;
}

/**
 * Build the default tool registry. Caller owns the policy + allow-list so it
 * can scope each run to a single project's working directory.
 */
export function buildToolRegistry(opts: ToolRegistryOptions): Map<string, ToolHandler> {
  const all: ToolHandler[] = [
    ...makeFsTools(opts.policy),
    makeProcessTool({ policy: opts.policy, allowList: opts.processAllowList }),
    ...makeGitTools({ policy: opts.policy }),
  ];
  const map = new Map<string, ToolHandler>();
  for (const t of all) map.set(t.name, t);
  return map;
}

export { type PathPolicy, PathPolicyError } from './path-policy';
