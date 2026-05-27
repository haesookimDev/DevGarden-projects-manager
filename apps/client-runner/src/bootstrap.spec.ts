import { describe, expect, it } from 'vitest';

import { BootstrapError, parseBootstrap, readFirstLine } from './bootstrap';

describe('parseBootstrap', () => {
  it('parses a well-formed payload', () => {
    const out = parseBootstrap(
      JSON.stringify({ apiBaseUrl: 'https://api.example.com', jwt: 'abc.def.ghi' }),
    );
    expect(out).toEqual({ apiBaseUrl: 'https://api.example.com', jwt: 'abc.def.ghi' });
  });

  it('rejects non-JSON input', () => {
    expect(() => parseBootstrap('not json')).toThrow(BootstrapError);
  });

  it('rejects a JSON array', () => {
    expect(() => parseBootstrap('[]')).toThrow(BootstrapError);
  });

  it('rejects missing apiBaseUrl', () => {
    expect(() => parseBootstrap(JSON.stringify({ jwt: 'x' }))).toThrow(/apiBaseUrl/);
  });

  it('rejects empty apiBaseUrl', () => {
    expect(() => parseBootstrap(JSON.stringify({ apiBaseUrl: '', jwt: 'x' }))).toThrow(
      /apiBaseUrl/,
    );
  });

  it('rejects scheme-less apiBaseUrl (sidecar needs http/https)', () => {
    expect(() =>
      parseBootstrap(JSON.stringify({ apiBaseUrl: 'localhost:3001', jwt: 'x' })),
    ).toThrow(/http\(s\)/);
  });

  it('rejects missing jwt', () => {
    expect(() => parseBootstrap(JSON.stringify({ apiBaseUrl: 'http://localhost:3001' }))).toThrow(
      /jwt/,
    );
  });

  it('rejects empty jwt', () => {
    expect(() =>
      parseBootstrap(JSON.stringify({ apiBaseUrl: 'http://localhost:3001', jwt: '' })),
    ).toThrow(/jwt/);
  });
});

describe('readFirstLine', () => {
  async function* feed(lines: string[]): AsyncGenerator<string> {
    for (const l of lines) yield l;
  }

  it('returns the first non-empty trimmed line', async () => {
    const out = await readFirstLine(feed(['', '   ', '{ "ok": 1 }', '{ "next": 2 }']));
    expect(out).toBe('{ "ok": 1 }');
  });

  it('throws when the stream closes without a non-empty line', async () => {
    await expect(readFirstLine(feed(['', '   ']))).rejects.toThrow(BootstrapError);
  });
});
