// Routes PairingStorage calls between the keychain backend (P2-1 / P2-2)
// and the legacy file backend (apps/client/src/lib/pairing-storage.ts).
//
// First load() picks a backend and caches it for the rest of the session:
//   1. ask the keychain. If `KeychainUnavailableError` → file backend.
//      Linux without libsecret / sandboxed environments without keychain
//      land here; the user keeps a working pairing instead of failing.
//   2. keychain reachable but empty AND legacy pairing.json has a record →
//      auto-migrate (write to keychain, clear file) then use keychain.
//   3. keychain reachable (with or without a record) → use keychain.
//
// save() / clear() called before load() trigger the same detection so a
// fresh pair right after install still ends up in the keychain.

import { KeychainUnavailableError, keychainPairingStorage } from './keychain-pairing-storage';
import { tauriPairingStorage } from './pairing-storage';
import type { PairingRecord, PairingStorage } from './pairing-storage';

export interface MigrationDetails {
  backend: 'keychain' | 'file';
  migrated: boolean;
  migrationFailed?: string;
}

let detectionPromise: Promise<{ backend: PairingStorage; details: MigrationDetails }> | null = null;

async function detect(): Promise<{ backend: PairingStorage; details: MigrationDetails }> {
  try {
    const keychainRecord = await keychainPairingStorage.load();
    if (keychainRecord) {
      return { backend: keychainPairingStorage, details: { backend: 'keychain', migrated: false } };
    }
    // Keychain is reachable but empty — check the legacy file for migration.
    let legacy: PairingRecord | undefined;
    try {
      legacy = await tauriPairingStorage.load();
    } catch {
      legacy = undefined;
    }
    if (!legacy) {
      return { backend: keychainPairingStorage, details: { backend: 'keychain', migrated: false } };
    }
    try {
      await keychainPairingStorage.save(legacy);
      await tauriPairingStorage.clear();
      return { backend: keychainPairingStorage, details: { backend: 'keychain', migrated: true } };
    } catch (err) {
      // Migration mid-flight failed (e.g. keychain.save blocked by user).
      // Stay on file storage so the pairing keeps working — better than a
      // half-migrated record that nobody can read.
      return {
        backend: tauriPairingStorage,
        details: {
          backend: 'file',
          migrated: false,
          migrationFailed: err instanceof Error ? err.message : String(err),
        },
      };
    }
  } catch (err) {
    if (err instanceof KeychainUnavailableError) {
      return { backend: tauriPairingStorage, details: { backend: 'file', migrated: false } };
    }
    throw err;
  }
}

function ensureBackend(): Promise<{ backend: PairingStorage; details: MigrationDetails }> {
  if (!detectionPromise) detectionPromise = detect();
  return detectionPromise;
}

// Test hook — resets the cached detection so a unit can re-run the routing.
export function __resetPairingStorageDetection(): void {
  detectionPromise = null;
}

export async function getPairingStorageDetails(): Promise<MigrationDetails> {
  const { details } = await ensureBackend();
  return details;
}

export const defaultPairingStorage: PairingStorage = {
  async load(): Promise<PairingRecord | undefined> {
    const { backend } = await ensureBackend();
    return backend.load();
  },
  async save(record: PairingRecord): Promise<void> {
    const { backend } = await ensureBackend();
    await backend.save(record);
  },
  async clear(): Promise<void> {
    const { backend } = await ensureBackend();
    await backend.clear();
  },
};
