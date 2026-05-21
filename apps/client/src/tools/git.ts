// git.* tools backed by the system `git` binary. Commits and pushes go through
// `git -c user.name=... -c user.email=...` so the project's commit attribution
// policy (see CLAUDE.md / AGENTS.md) is honored without touching the user's
// global git config.

import { spawn as defaultSpawn } from 'node:child_process';
import type { ToolHandler } from '@devgarden/harness-core';
import { resolveInside, type PathPolicy } from './path-policy';
import type { SpawnLike } from './process';

const GIT_USER_NAME = 'haesookimDev';
const GIT_USER_EMAIL = 'ww232330@gmail.com';

export interface GitToolOptions {
  policy: PathPolicy;
  spawnImpl?: SpawnLike;
  timeoutMs?: number;
}

export function makeGitTools(opts: GitToolOptions): ToolHandler[] {
  const runGit = async (
    args: string[],
    cwdRel?: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> => {
    const spawn = opts.spawnImpl ?? defaultSpawn;
    const cwd = resolveInside(opts.policy, cwdRel ?? '.');
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`git ${args.join(' ')} timed out`));
      }, opts.timeoutMs ?? 60_000);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    return {
      stdout: Buffer.concat(out).toString('utf8'),
      stderr: Buffer.concat(err).toString('utf8'),
      exitCode,
    };
  };

  return [
    {
      name: 'git.createBranch',
      async run(input) {
        const name = requireString(input, 'name');
        const res = await runGit(['checkout', '-b', name], stringOrUndef(input.cwd));
        if (res.exitCode !== 0) throw new Error(`git checkout -b failed: ${res.stderr}`);
        return { branch: name };
      },
    },
    {
      name: 'git.commit',
      async run(input) {
        const message = requireString(input, 'message');
        const cwd = stringOrUndef(input.cwd);
        const addRes = await runGit(['add', '-A'], cwd);
        if (addRes.exitCode !== 0) throw new Error(`git add failed: ${addRes.stderr}`);
        const res = await runGit(
          [
            '-c',
            `user.name=${GIT_USER_NAME}`,
            '-c',
            `user.email=${GIT_USER_EMAIL}`,
            'commit',
            '-m',
            message,
          ],
          cwd,
        );
        if (res.exitCode !== 0) throw new Error(`git commit failed: ${res.stderr || res.stdout}`);
        return { message, stdout: res.stdout };
      },
    },
    {
      name: 'git.push',
      async run(input) {
        const cwd = stringOrUndef(input.cwd);
        const args =
          typeof input.branch === 'string' ? ['push', '-u', 'origin', input.branch] : ['push'];
        const res = await runGit(
          ['-c', `user.name=${GIT_USER_NAME}`, '-c', `user.email=${GIT_USER_EMAIL}`, ...args],
          cwd,
        );
        if (res.exitCode !== 0) throw new Error(`git push failed: ${res.stderr || res.stdout}`);
        return { stdout: res.stdout };
      },
    },
    {
      name: 'git.diff',
      async run(input) {
        const cwd = stringOrUndef(input.cwd);
        const res = await runGit(['diff', '--no-color'], cwd);
        return { stdout: res.stdout, exitCode: res.exitCode };
      },
    },
  ];
}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string') throw new Error(`git tool: "${key}" must be a string`);
  return v;
}
function stringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
