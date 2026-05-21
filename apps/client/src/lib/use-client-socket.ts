import { useEffect, useState } from 'react';
import { startClientSocket, type ClientSocketDeps, type ConnectionStatus } from './client-socket';
import { executeRun, type RunExecutorDeps } from './run-executor';

export interface UseClientSocketInput {
  apiBaseUrl: string | undefined;
  jwt: string | undefined;
  /** Optional override for harness execution (tests). */
  executorDeps?: RunExecutorDeps;
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
        onRunStart: (payload, socket) => {
          void executeRun(socket, payload, input.executorDeps);
        },
      },
      deps,
    );
    return () => handle.disconnect();
    // Only re-connect when apiBaseUrl/jwt change. `deps` and `executorDeps`
    // are static injection points for tests; not reactive dependencies.
  }, [input.apiBaseUrl, input.jwt]);

  return status;
}
