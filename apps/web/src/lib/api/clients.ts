import { internalFetch } from './internal';

export interface IssuePairingTokenInput {
  ownerId: string;
  clientName: string;
}

export interface IssuedPairingToken {
  token: string;
  expiresAt: string;
}

export async function issuePairingToken(
  input: IssuePairingTokenInput,
): Promise<IssuedPairingToken> {
  const res = await internalFetch('/internal/clients/pairings', {
    method: 'POST',
    body: input,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`issuePairingToken failed: ${res.status} ${text}`);
  }
  return (await res.json()) as IssuedPairingToken;
}
