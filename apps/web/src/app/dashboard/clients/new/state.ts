export interface PairingFormState {
  token: string | null;
  expiresAt: string | null;
  error: string | null;
}

export const INITIAL_PAIRING_STATE: PairingFormState = {
  token: null,
  expiresAt: null,
  error: null,
};
