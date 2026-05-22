import { useEffect, useState } from 'react';
import { startClientSocket, type ClientSocketDeps, type ConnectionStatus } from './client-socket';

export interface UseClientSocketInput {
  apiBaseUrl: string | undefined;
  jwt: string | undefined;
}

// NOTE: `run-executor.ts` and the harness tools (fs/process/git) use Node.js
// APIs (`node:fs/promises`, `node:child_process`, `node:path`). Tauri's
// webview is a browser context — these APIs don't exist there. Statically
// importing the runner from this hook would pull the whole tool tree into
// the Vite bundle and crash on first module load.
//
// Harness execution from the desktop client therefore needs either:
//   - a Node.js sidecar process spawned by the Rust binary, OR
//   - Tauri Rust commands that the webview calls via `invoke()`.
//
// Both are v0.2+ work. Until then the webview only handles pairing + socket
// liveness; the api will see the socket as ONLINE but no `run:start` ack.
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
    // Only re-connect when apiBaseUrl/jwt change. `deps` is a static config
    // injection point used by tests; not a reactive dependency.
  }, [input.apiBaseUrl, input.jwt]);

  return status;
}
