// process.run tool: executes a command from an allow-list.
// stdout / stderr are buffered (capped at MAX_BUFFER) and returned along with the exit code.
// cwd is forced inside the project root.

import { spawn as defaultSpawn, type SpawnOptions } from 'node:child_process';
import type { ToolHandler } from '@devgarden/harness-core';
import { resolveInside, type PathPolicy } from './path-policy';

export class ProcessPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessPolicyError';
  }
}

export class ProcessCancelledError extends Error {
  constructor(message = 'process.run cancelled') {
    super(message);
    this.name = 'ProcessCancelledError';
  }
}

const MAX_BUFFER = 1024 * 1024; // 1 MB per stream
const DEFAULT_KILL_GRACE_MS = 5_000;

export type SpawnLike = typeof defaultSpawn;

export interface ProcessOptions {
  policy: PathPolicy;
  allowList: ReadonlyArray<string>;
  timeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL when a run is cancelled. */
  killGraceMs?: number;
  spawnImpl?: SpawnLike;
}

export function makeProcessTool(opts: ProcessOptions): ToolHandler {
  const allow = new Set(opts.allowList);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const killGraceMs = opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const spawn = opts.spawnImpl ?? defaultSpawn;

  return {
    name: 'process.run',
    async run(input, ctx) {
      const command = requireString(input, 'command');
      if (!allow.has(command)) {
        throw new ProcessPolicyError(`command "${command}" is not in the allow-list`);
      }
      const args = parseArgs(input.args);
      const cwdRel = typeof input.cwd === 'string' ? input.cwd : '.';
      const cwd = resolveInside(opts.policy, cwdRel);

      const spawnOpts: SpawnOptions = { cwd, stdio: ['ignore', 'pipe', 'pipe'] };
      const child = spawn(command, args, spawnOpts);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutLen = 0;
      let stderrLen = 0;
      let truncated = false;

      child.stdout?.on('data', (c: Buffer) => {
        if (stdoutLen + c.length > MAX_BUFFER) {
          truncated = true;
          return;
        }
        stdoutChunks.push(c);
        stdoutLen += c.length;
      });
      child.stderr?.on('data', (c: Buffer) => {
        if (stderrLen + c.length > MAX_BUFFER) {
          truncated = true;
          return;
        }
        stderrChunks.push(c);
        stderrLen += c.length;
      });

      const signal = ctx?.signal;
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        let cancelled = false;
        let graceTimer: ReturnType<typeof setTimeout> | undefined;

        // On cancel: SIGTERM the child, then escalate to SIGKILL after the
        // grace period. The close handler rejects so the runner records a
        // cancellation rather than a spurious success/exit code.
        const onAbort = () => {
          cancelled = true;
          child.kill('SIGTERM');
          graceTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
          graceTimer.unref?.();
        };

        const cleanup = () => {
          clearTimeout(timer);
          if (graceTimer) clearTimeout(graceTimer);
          signal?.removeEventListener('abort', onAbort);
        };

        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          cleanup();
          reject(new Error(`process.run timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        if (signal) {
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }

        child.on('error', (err) => {
          cleanup();
          reject(err);
        });
        child.on('close', (code) => {
          cleanup();
          if (cancelled) {
            reject(new ProcessCancelledError());
            return;
          }
          resolve(code);
        });
      });

      return {
        command,
        args,
        cwd,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        truncated,
      };
    },
  };
}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string') throw new Error(`process.run: "${key}" must be a string`);
  return v;
}

function parseArgs(v: unknown): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  throw new Error('process.run: "args" must be an array of strings');
}
