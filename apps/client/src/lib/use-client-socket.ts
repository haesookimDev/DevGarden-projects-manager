import { useEffect, useState } from 'react';
import { startClientSocket, type ClientSocketDeps, type ConnectionStatus } from './client-socket';

export interface UseClientSocketInput {
  apiBaseUrl: string | undefined;
  jwt: string | undefined;
}

export function useClientSocket(
  input: UseClientSocketInput,
  deps?: ClientSocketDeps,
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!input.apiBaseUrl || !input.jwt) {
      setStatus({ kind: 'idle' });
      return;
    }
    const handle = startClientSocket(
      {
        apiBaseUrl: input.apiBaseUrl,
        jwt: input.jwt,
        onStatus: setStatus,
      },
      deps,
    );
    return () => handle.disconnect();
    // deps reference identity is stable per render in App.tsx (not memoized);
    // we intentionally only re-connect when apiBaseUrl/jwt change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.apiBaseUrl, input.jwt]);

  return status;
}
