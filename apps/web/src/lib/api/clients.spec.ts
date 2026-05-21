import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issuePairingToken } from './clients';

const originalUrl = process.env.API_INTERNAL_URL;
const originalSecret = process.env.INTERNAL_API_SECRET;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('issuePairingToken', () => {
  beforeEach(() => {
    process.env.API_INTERNAL_URL = 'http://api.local';
    process.env.INTERNAL_API_SECRET = 'shh';
  });

  afterEach(() => {
    restore('API_INTERNAL_URL', originalUrl);
    restore('INTERNAL_API_SECRET', originalSecret);
    vi.unstubAllGlobals();
  });

  it('POSTs to /internal/clients/pairings with body and returns parsed json', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'tok-1', expiresAt: '2030-01-01T00:00:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await issuePairingToken({ ownerId: 'o-1', clientName: 'Laptop' });

    expect(result).toEqual({ token: 'tok-1', expiresAt: '2030-01-01T00:00:00Z' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.local/internal/clients/pairings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ownerId: 'o-1', clientName: 'Laptop' });
  });

  it('throws when api responds non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(issuePairingToken({ ownerId: 'o', clientName: 'c' })).rejects.toThrow(
      /issuePairingToken failed: 500/,
    );
  });
});
