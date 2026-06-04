// Routing + migration cases for defaultPairingStorage.
// Both backends are mocked via vi.doMock so the tested logic stays focused on
// the decision tree (keychain vs file, migration trigger conditions).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairingRecord } from './pairing-storage';

const sampleRecord: PairingRecord = {
  apiBaseUrl: 'http://api',
  jwt: 'j',
  clientId: 'c',
  name: 'Laptop',
  pairedAt: '2026-06-04T00:00:00Z',
};

interface Mocked {
  keychain: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  file: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

async function loadModule(mocked: Mocked) {
  vi.resetModules();
  vi.doMock('./keychain-pairing-storage', () => ({
    KeychainUnavailableError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'KeychainUnavailableError';
      }
    },
    keychainPairingStorage: mocked.keychain,
  }));
  vi.doMock('./pairing-storage', () => ({
    tauriPairingStorage: mocked.file,
  }));
  return import('./default-pairing-storage');
}

function makeMocked(): Mocked {
  return {
    keychain: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
    file: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('./keychain-pairing-storage');
  vi.doUnmock('./pairing-storage');
});

describe('defaultPairingStorage', () => {
  it('uses the keychain when it already holds a record', async () => {
    const m = makeMocked();
    m.keychain.load.mockResolvedValue(sampleRecord);
    const mod = await loadModule(m);
    expect(await mod.defaultPairingStorage.load()).toEqual(sampleRecord);
    expect(m.file.load).not.toHaveBeenCalled();
    expect((await mod.getPairingStorageDetails()).backend).toBe('keychain');
  });

  it('migrates the legacy file record into the keychain', async () => {
    const m = makeMocked();
    m.keychain.load.mockResolvedValue(undefined);
    m.file.load.mockResolvedValue(sampleRecord);
    m.keychain.save.mockResolvedValue(undefined);
    m.file.clear.mockResolvedValue(undefined);
    const mod = await loadModule(m);
    expect(await mod.defaultPairingStorage.load()).toBeUndefined();
    expect(m.keychain.save).toHaveBeenCalledWith(sampleRecord);
    expect(m.file.clear).toHaveBeenCalled();
    expect((await mod.getPairingStorageDetails()).migrated).toBe(true);
  });

  it('falls back to file storage when KeychainUnavailableError is thrown', async () => {
    const m = makeMocked();
    const mod = await loadModule(m);
    m.keychain.load.mockRejectedValueOnce(
      new (await import('./keychain-pairing-storage')).KeychainUnavailableError('no libsecret'),
    );
    expect(await mod.defaultPairingStorage.load()).toBeUndefined();
    expect((await mod.getPairingStorageDetails()).backend).toBe('file');
  });

  it('save() routes through the cached backend', async () => {
    const m = makeMocked();
    m.keychain.load.mockResolvedValue(undefined);
    m.file.load.mockResolvedValue(undefined);
    m.keychain.save.mockResolvedValue(undefined);
    const mod = await loadModule(m);
    await mod.defaultPairingStorage.save(sampleRecord);
    expect(m.keychain.save).toHaveBeenCalledWith(sampleRecord);
    expect(m.file.save).not.toHaveBeenCalled();
  });

  it('stays on file when migration mid-flight fails', async () => {
    const m = makeMocked();
    m.keychain.load.mockResolvedValue(undefined);
    m.file.load.mockResolvedValue(sampleRecord);
    m.keychain.save.mockRejectedValueOnce(new Error('user denied'));
    const mod = await loadModule(m);
    expect(await mod.defaultPairingStorage.load()).toEqual(sampleRecord);
    const details = await mod.getPairingStorageDetails();
    expect(details.backend).toBe('file');
    expect(details.migrationFailed).toMatch(/user denied/);
  });
});
