// PairingStorage backed by the OS keychain via the Tauri rust commands
// registered in apps/client/src-tauri/src/keychain.rs (v0.3 P2).
//
// The keychain entry holds the full PairingRecord serialised as JSON so a
// single get/set call round-trips everything pair-client cares about. When
// the OS reports "no backend available" (NoStorageAccess / PlatformFailure)
// the rust command throws KeychainError { kind: "unavailable" }; callers
// (P2-3 / P2-4) can read that and fall back to the legacy file storage.

import { invoke } from '@tauri-apps/api/core';
import type { PairingRecord, PairingStorage } from './pairing-storage';

export class KeychainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeychainUnavailableError';
  }
}

interface RustKeychainError {
  kind?: string;
  message?: string;
}

function rethrow(err: unknown): never {
  if (err && typeof err === 'object') {
    const e = err as RustKeychainError;
    if (e.kind === 'unavailable') {
      throw new KeychainUnavailableError(e.message ?? 'keychain unavailable');
    }
    if (typeof e.message === 'string') {
      throw new Error(e.message);
    }
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export const keychainPairingStorage: PairingStorage = {
  async load(): Promise<PairingRecord | undefined> {
    try {
      const raw = await invoke<string | null>('keychain_get');
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as PairingRecord;
      return parsed;
    } catch (err) {
      rethrow(err);
    }
  },
  async save(record: PairingRecord): Promise<void> {
    try {
      await invoke('keychain_set', { value: JSON.stringify(record) });
    } catch (err) {
      rethrow(err);
    }
  },
  async clear(): Promise<void> {
    try {
      await invoke('keychain_delete');
    } catch (err) {
      rethrow(err);
    }
  },
};
