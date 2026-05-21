import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internalFetch } from './internal';

const originalUrl = process.env.API_INTERNAL_URL;
const originalSecret = process.env.INTERNAL_API_SECRET;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('internalFetch', () => {
  beforeEach(() => {
    process.env.API_INTERNAL_URL = 'http://api.local';
    process.env.INTERNAL_API_SECRET = 'shh';
  });

  afterEach(() => {
    restore('API_INTERNAL_URL', originalUrl);
    restore('INTERNAL_API_SECRET', originalSecret);
    vi.unstubAllGlobals();
  });

  it('throws when env is missing', async () => {
    delete process.env.API_INTERNAL_URL;
    await expect(internalFetch('/x', { method: 'GET' })).rejects.toThrow();
  });

  it('GET attaches x-internal-secret without content-type', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);

    await internalFetch('/x', { method: 'GET' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.local/x');
    expect(init.method).toBe('GET');
    expect(init.headers['x-internal-secret']).toBe('shh');
    expect(init.headers['content-type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('POST attaches content-type and serializes body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);

    await internalFetch('/y', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['x-internal-secret']).toBe('shh');
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });
});
