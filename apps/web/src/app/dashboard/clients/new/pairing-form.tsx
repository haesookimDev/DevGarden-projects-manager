'use client';

import { useActionState } from 'react';
import { Button, Input, Label } from '@devgarden/ui';
import { createPairingAction } from './actions';
import { INITIAL_PAIRING_STATE } from './state';

export function PairingForm() {
  const [state, action, pending] = useActionState(createPairingAction, INITIAL_PAIRING_STATE);

  return (
    <div className="mt-6 max-w-xl space-y-6">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pairing-client-name">Client name</Label>
          <Input
            id="pairing-client-name"
            name="clientName"
            type="text"
            placeholder="My Laptop"
            required
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Generating…' : 'Generate pairing token'}
        </Button>
      </form>

      {state.error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.token && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-500">
            Pairing token (이 화면을 떠나면 다시 볼 수 없습니다)
          </p>
          <pre
            data-testid="pairing-token"
            className="mt-2 overflow-x-auto rounded bg-background/60 p-3 font-mono text-xs"
          >
            {state.token}
          </pre>
          {state.expiresAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              만료: {new Date(state.expiresAt).toLocaleString()}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            데스크탑 클라이언트를 열고 이 토큰을 붙여넣어 페어링을 완료하세요.
          </p>
        </div>
      )}
    </div>
  );
}
