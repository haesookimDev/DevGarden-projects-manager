import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeFsTools } from './fs';
import { PathPolicyError } from './path-policy';

let root: string;
let tools: ReturnType<typeof makeFsTools>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devgarden-fs-'));
  tools = makeFsTools({ rootDir: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function findTool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe('fs.write + fs.read', () => {
  it('writes a file and reads it back', async () => {
    await findTool('fs.write').run({ path: 'src/x.txt', content: 'hello' }, { runId: 'r' });
    const back = await findTool('fs.read').run({ path: 'src/x.txt' }, { runId: 'r' });
    expect(back).toEqual({ path: 'src/x.txt', content: 'hello' });

    const onDisk = await readFile(join(root, 'src/x.txt'), 'utf8');
    expect(onDisk).toBe('hello');
  });
});

describe('fs.list', () => {
  it('lists files with isDirectory and size', async () => {
    await findTool('fs.write').run({ path: 'a.txt', content: 'AB' }, { runId: 'r' });
    await findTool('fs.write').run({ path: 'sub/b.txt', content: 'XYZ' }, { runId: 'r' });
    const res = (await findTool('fs.list').run({ path: '.' }, { runId: 'r' })) as {
      entries: Array<{ name: string; isDirectory: boolean; size: number }>;
    };
    const names = res.entries.map((e) => e.name).sort();
    expect(names).toEqual(['a.txt', 'sub']);
    const a = res.entries.find((e) => e.name === 'a.txt')!;
    expect(a.isDirectory).toBe(false);
    expect(a.size).toBe(2);
  });
});

describe('path policy', () => {
  it('refuses paths that escape the root', async () => {
    await expect(
      findTool('fs.read').run({ path: '../outside.txt' }, { runId: 'r' }),
    ).rejects.toBeInstanceOf(PathPolicyError);
  });

  it('refuses absolute paths that fall outside the root', async () => {
    await expect(
      findTool('fs.write').run({ path: '/etc/passwd', content: 'no' }, { runId: 'r' }),
    ).rejects.toBeInstanceOf(PathPolicyError);
  });
});
