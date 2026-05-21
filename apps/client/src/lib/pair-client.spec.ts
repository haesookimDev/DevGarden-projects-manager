import { describe, expect, it, vi } from 'vitest';
import { PairClientError, pairClient } from './pair-client';
import type { PairingRecord, PairingStorage } from './pairing-storage';

function makeMemoryStorage(): PairingStorage & { current?: PairingRecord } {
  const state: { current?: PairingRecord } = {};
  return {
    load: async () => state.current,
    save: async (r) => {
      state.current = r;
    },
    clear: async () => {
      state.current = undefined;
    },
    get current() {
      return state.current;
    },
  };
}

describe('pairClient', () => {
  it('rejects when apiBaseUrl is empty', async () => {
    const storage = makeMemoryStorage();
    await expect(pairClient({ apiBaseUrl: '', token: 't' }, storage)).rejects.toBeInstanceOf(
      PairClientError,
    );
  });

  it('rejects when token is empty', async () => {
    const storage = makeMemoryStorage();
    await expect(pairClient({ apiBaseUrl: 'http://x', token: '' }, storage)).rejects.toBeInstanceOf(
      PairClientError,
    );
  });

  it('POSTs the token then persists the returned jwt', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ clientId: 'cid-1', jwt: 'jwt-1', name: 'Laptop' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const record = await pairClient(
      { apiBaseUrl: 'http://api.local', token: 'pair-token', hostname: 'host-x', os: 'darwin' },
      storage,
      fetchFn as unknown as typeof fetch,
    );

    expect(record.jwt).toBe('jwt-1');
    expect(record.clientId).toBe('cid-1');
    expect(record.apiBaseUrl).toBe('http://api.local');
    expect(storage.current?.jwt).toBe('jwt-1');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://api.local/clients/pair');
    expect(JSON.parse(init.body)).toEqual({
      token: 'pair-token',
      hostname: 'host-x',
      os: 'darwin',
      version: undefined,
    });
  });

  it('trims trailing slash from apiBaseUrl', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ clientId: 'c', jwt: 'j', name: 'n' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await pairClient(
      { apiBaseUrl: 'http://api.local/', token: 't' },
      storage,
      fetchFn as unknown as typeof fetch,
    );
    expect(fetchFn.mock.calls[0][0]).toBe('http://api.local/clients/pair');
  });

  it('throws PairClientError with status on non-2xx', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    try {
      await pairClient(
        { apiBaseUrl: 'http://api.local', token: 't' },
        storage,
        fetchFn as unknown as typeof fetch,
      );
      expect.fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PairClientError);
      expect((e as PairClientError).status).toBe(401);
    }
    expect(storage.current).toBeUndefined();
  });
});
