// Exercises the git.* tools against a real `git init` repo in a temp dir.
// Skipped automatically if `git` is not on PATH.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeGitTools } from './git';

const gitAvailable = await new Promise<boolean>((resolve) => {
  const child = spawn('git', ['--version'], { stdio: 'ignore' });
  child.on('error', () => resolve(false));
  child.on('close', (code) => resolve(code === 0));
});

const maybe = gitAvailable ? describe : describe.skip;

let root: string;

async function runGit(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} -> ${code}`))));
    child.on('error', reject);
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devgarden-git-'));
  if (gitAvailable) {
    await runGit(['init', '--initial-branch=main'], root);
    await writeFile(join(root, 'README.md'), 'initial\n');
    await runGit(
      ['-c', 'user.name=seed', '-c', 'user.email=seed@example.com', 'add', '-A'],
      root,
    );
    await runGit(
      ['-c', 'user.name=seed', '-c', 'user.email=seed@example.com', 'commit', '-m', 'seed'],
      root,
    );
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

maybe('git tools — branch + commit', () => {
  it('createBranch + commit produce a new commit attributed to haesookimDev', async () => {
    const tools = makeGitTools({ policy: { rootDir: root } });
    const branchTool = tools.find((t) => t.name === 'git.createBranch')!;
    const commitTool = tools.find((t) => t.name === 'git.commit')!;

    await branchTool.run({ name: 'feat/test-branch' }, { runId: 'r' });
    await writeFile(join(root, 'README.md'), 'updated\n');
    await commitTool.run({ message: 'chore: bump readme' }, { runId: 'r' });

    // Verify last commit author.
    const author = await new Promise<string>((resolve, reject) => {
      const child = spawn('git', ['log', '-1', '--pretty=%an <%ae>'], { cwd: root });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error('log failed'))));
    });
    expect(author).toBe('haesookimDev <ww232330@gmail.com>');

    // Branch is the one we created.
    const branch = await new Promise<string>((resolve, reject) => {
      const child = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error('rev-parse failed'))));
    });
    expect(branch).toBe('feat/test-branch');

    // Sanity: file content matches.
    const onDisk = await readFile(join(root, 'README.md'), 'utf8');
    expect(onDisk).toBe('updated\n');
  });
});
