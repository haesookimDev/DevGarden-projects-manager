// Calls POST {apiBaseUrl}/clients/pair with a pairing token and persists the
// resulting JWT via the supplied PairingStorage. Decoupled from
// tauri-plugin-store so it can be unit-tested with an in-memory stub.

import type { PairingRecord, PairingStorage } from './pairing-storage';

export interface PairClientInput {
  apiBaseUrl: string;
  token: string;
  hostname?: string;
  os?: string;
  version?: string;
}

export interface PairClientResponse {
  clientId: string;
  jwt: string;
  name: string;
}

export class PairClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PairClientError';
  }
}

export async function pairClient(
  input: PairClientInput,
  storage: PairingStorage,
  fetchImpl: typeof fetch = fetch,
): Promise<PairingRecord> {
  if (!input.apiBaseUrl) throw new PairClientError('apiBaseUrl is required');
  if (!input.token) throw new PairClientError('token is required');

  const url = `${input.apiBaseUrl.replace(/\/$/, '')}/clients/pair`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: input.token,
      hostname: input.hostname,
      os: input.os,
      version: input.version,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PairClientError(`pair failed: ${res.status} ${text}`, res.status);
  }

  const data = (await res.json()) as PairClientResponse;
  const record: PairingRecord = {
    apiBaseUrl: input.apiBaseUrl,
    jwt: data.jwt,
    clientId: data.clientId,
    name: data.name,
    pairedAt: new Date().toISOString(),
  };
  await storage.save(record);
  return record;
}
