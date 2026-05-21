'use server';

import { auth } from '@/auth';
import { issuePairingToken } from '@/lib/api/clients';
import type { PairingFormState } from './state';

export async function createPairingAction(
  _prev: PairingFormState,
  formData: FormData,
): Promise<PairingFormState> {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return { token: null, expiresAt: null, error: '세션이 만료되었습니다. 다시 로그인하세요.' };
  }

  const clientName = String(formData.get('clientName') ?? '').trim();
  if (!clientName) {
    return { token: null, expiresAt: null, error: '클라이언트 이름을 입력하세요.' };
  }

  try {
    const issued = await issuePairingToken({ ownerId, clientName });
    return { token: issued.token, expiresAt: issued.expiresAt, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '발급 실패';
    return { token: null, expiresAt: null, error: msg };
  }
}
