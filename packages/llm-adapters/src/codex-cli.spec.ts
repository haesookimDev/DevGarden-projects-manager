import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CodexCliProvider, type SpawnFn } from './codex-cli';
import { LlmProviderError } from './types';

interface FakeChild extends EventEmitter {
  stdin: Writable & { ended?: Buffer };
  stdout: Readable;
  stderr: Readable;
  kill: (signal?: string) => void;
}

function makeFakeChild(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  emitError?: Error;
}): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.kill = () => undefined;

  let captured = Buffer.alloc(0);
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      captured = Buffer.concat([captured, chunk as Buffer]);
      cb();
    },
    final(cb) {
      (ee.stdin as Writable & { ended?: Buffer }).ended = captured;
      cb();
    },
  });
  ee.stdin = stdin as Writable & { ended?: Buffer };

  ee.stdout = Readable.from(opts.stdout !== undefined ? [Buffer.from(opts.stdout)] : []);
  ee.stderr = Readable.from(opts.stderr !== undefined ? [Buffer.from(opts.stderr)] : []);

  setImmediate(() => {
    if (opts.emitError) ee.emit('error', opts.emitError);
    else ee.emit('close', opts.exitCode ?? 0);
  });

  return ee;
}

function makeSpawn(child: FakeChild): SpawnFn {
  return (() => child as never) as unknown as SpawnFn;
}

describe('CodexCliProvider', () => {
  it('writes the request JSON to stdin and parses the JSON response from stdout', async () => {
    const child = makeFakeChild({
      stdout: JSON.stringify({ text: 'hello back', tokens: { input: 3, output: 2 } }),
      exitCode: 0,
    });
    const provider = new CodexCliProvider({ id: 'codex', spawnImpl: makeSpawn(child) });

    const res = await provider.chat({
      model: 'codex-1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(res.text).toBe('hello back');
    expect(res.tokens).toEqual({ input: 3, output: 2 });

    const sent = (child.stdin as Writable & { ended?: Buffer }).ended?.toString('utf8');
    expect(JSON.parse((sent ?? '').trim())).toEqual({
      model: 'codex-1',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: undefined,
    });
  });

  it('throws LlmProviderError when the subprocess exits non-zero', async () => {
    const child = makeFakeChild({ stdout: '', stderr: 'oops', exitCode: 2 });
    const provider = new CodexCliProvider({ id: 'codex', spawnImpl: makeSpawn(child) });
    await expect(provider.chat({ model: 'x', messages: [] })).rejects.toBeInstanceOf(
      LlmProviderError,
    );
  });

  it('throws LlmProviderError when stdout is not JSON', async () => {
    const child = makeFakeChild({ stdout: 'not json', exitCode: 0 });
    const provider = new CodexCliProvider({ id: 'codex', spawnImpl: makeSpawn(child) });
    await expect(provider.chat({ model: 'x', messages: [] })).rejects.toThrow(
      /codex-cli emitted non-JSON/,
    );
  });

  it('throws LlmProviderError when the subprocess emits error', async () => {
    const child = makeFakeChild({ emitError: new Error('ENOENT codex') });
    const provider = new CodexCliProvider({ id: 'codex', spawnImpl: makeSpawn(child) });
    await expect(provider.chat({ model: 'x', messages: [] })).rejects.toThrow(
      /codex-cli spawn failed/,
    );
  });

  it('uses default command "codex" and args ["chat","--format","json"]', () => {
    const spawnSpy = vi.fn().mockImplementation(() => makeFakeChild({ stdout: '{"text":""}' }));
    const provider = new CodexCliProvider({ id: 'codex', spawnImpl: spawnSpy as never });
    void provider.chat({ model: 'x', messages: [] });
    expect(spawnSpy.mock.calls[0]![0]).toBe('codex');
    expect(spawnSpy.mock.calls[0]![1]).toEqual(['chat', '--format', 'json']);
  });
});
