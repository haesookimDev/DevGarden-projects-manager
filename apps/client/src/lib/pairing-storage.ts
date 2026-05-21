// Persists the pairing JWT + client metadata via tauri-plugin-store.
// MVP: a single Store file `pairing.json` under Tauri's app data dir.
// TODO: swap for OS keychain (keyring / stronghold) to encrypt at rest.

import { Store } from '@tauri-apps/plugin-store';

const STORE_FILE = 'pairing.json';
const KEY = 'pairing';

export interface PairingRecord {
  apiBaseUrl: string;
  jwt: string;
  clientId: string;
  name: string;
  pairedAt: string; // ISO timestamp
}

export interface PairingStorage {
  load(): Promise<PairingRecord | undefined>;
  save(record: PairingRecord): Promise<void>;
  clear(): Promise<void>;
}

export const tauriPairingStorage: PairingStorage = {
  async load() {
    const store = await Store.load(STORE_FILE);
    return (await store.get<PairingRecord>(KEY)) ?? undefined;
  },
  async save(record) {
    const store = await Store.load(STORE_FILE);
    await store.set(KEY, record);
    await store.save();
  },
  async clear() {
    const store = await Store.load(STORE_FILE);
    await store.delete(KEY);
    await store.save();
  },
};
