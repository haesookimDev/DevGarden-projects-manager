import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeProcessTool, ProcessPolicyError } from './process';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devgarden-proc-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('process.run — allow-list', () => {
  it('rejects commands not in the allow-list', async () => {
    const tool = makeProcessTool({ policy: { rootDir: root }, allowList: ['echo'] });
    await expect(
      tool.run({ command: 'rm', args: ['-rf', '/'] }, { runId: 'r' }),
    ).rejects.toBeInstanceOf(ProcessPolicyError);
  });

  it('runs an allow-listed command and captures stdout + exitCode', async () => {
    const tool = makeProcessTool({ policy: { rootDir: root }, allowList: ['echo'] });
    const out = (await tool.run(
      { command: 'echo', args: ['hello-from-test'] },
      { runId: 'r' },
    )) as { stdout: string; exitCode: number };
    expect(out.stdout.trim()).toBe('hello-from-test');
    expect(out.exitCode).toBe(0);
  });

  it('captures non-zero exit', async () => {
    const tool = makeProcessTool({ policy: { rootDir: root }, allowList: ['node'] });
    const out = (await tool.run(
      { command: 'node', args: ['-e', 'process.exit(7)'] },
      { runId: 'r' },
    )) as { exitCode: number };
    expect(out.exitCode).toBe(7);
  });
});
