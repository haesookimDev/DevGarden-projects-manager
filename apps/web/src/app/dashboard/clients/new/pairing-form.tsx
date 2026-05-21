'use client';

import { useActionState } from 'react';
import { createPairingAction, INITIAL_PAIRING_STATE } from './actions';

export function PairingForm() {
  const [state, action, pending] = useActionState(createPairingAction, INITIAL_PAIRING_STATE);

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-neutral-300">Client name</span>
          <input
            name="clientName"
            type="text"
            placeholder="My Laptop"
            required
            disabled={pending}
            className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? 'Generating…' : 'Generate pairing token'}
        </button>
      </form>

      {state.error && (
        <p className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.token && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            Pairing token (이 화면을 떠나면 다시 볼 수 없습니다)
          </p>
          <pre
            data-testid="pairing-token"
            className="mt-2 overflow-x-auto rounded bg-black/40 p-3 font-mono text-xs text-emerald-100"
          >
            {state.token}
          </pre>
          {state.expiresAt && (
            <p className="mt-2 text-xs text-neutral-400">
              만료: {new Date(state.expiresAt).toLocaleString()}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-400">
            데스크탑 클라이언트를 열고 이 토큰을 붙여넣어 페어링을 완료하세요.
          </p>
        </div>
      )}
    </div>
  );
}
