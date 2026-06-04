// Unit cases for the keychain-backed PairingStorage. The Tauri `invoke`
// call is mocked so the spec can stay in the vitest pool without ever
// touching the real OS keychain.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  invokeMock.mockReset();
});

describe('keychainPairingStorage', () => {
  it('returns undefined when keychain_get reports no entry', async () => {
    invokeMock.mockResolvedValueOnce(null);
    const { keychainPairingStorage } = await import('./keychain-pairing-storage');
    expect(await keychainPairingStorage.load()).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('keychain_get');
  });

  it('deserialises the JSON payload from keychain_get', async () => {
    invokeMock.mockResolvedValueOnce(
      JSON.stringify({
        apiBaseUrl: 'http://api',
        jwt: 'j',
        clientId: 'c',
        name: 'Laptop',
        pairedAt: '2026-06-04T00:00:00Z',
      }),
    );
    const { keychainPairingStorage } = await import('./keychain-pairing-storage');
    const record = await keychainPairingStorage.load();
    expect(record?.jwt).toBe('j');
    expect(record?.clientId).toBe('c');
  });

  it('save() invokes keychain_set with the stringified record', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { keychainPairingStorage } = await import('./keychain-pairing-storage');
    await keychainPairingStorage.save({
      apiBaseUrl: 'http://api',
      jwt: 'j',
      clientId: 'c',
      name: 'Laptop',
      pairedAt: '2026-06-04T00:00:00Z',
    });
    expect(invokeMock).toHaveBeenCalledWith('keychain_set', {
      value: expect.stringContaining('"jwt":"j"'),
    });
  });

  it('clear() invokes keychain_delete', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { keychainPairingStorage } = await import('./keychain-pairing-storage');
    await keychainPairingStorage.clear();
    expect(invokeMock).toHaveBeenCalledWith('keychain_delete');
  });

  it('throws KeychainUnavailableError on rust kind=unavailable', async () => {
    invokeMock.mockRejectedValueOnce({ kind: 'unavailable', message: 'libsecret missing' });
    const { keychainPairingStorage, KeychainUnavailableError } =
      await import('./keychain-pairing-storage');
    await expect(keychainPairingStorage.load()).rejects.toBeInstanceOf(KeychainUnavailableError);
  });

  it('rethrows other rust errors verbatim', async () => {
    invokeMock.mockRejectedValueOnce({ kind: 'failed', message: 'permission denied' });
    const { keychainPairingStorage } = await import('./keychain-pairing-storage');
    await expect(keychainPairingStorage.load()).rejects.toThrow(/permission denied/);
  });
});
