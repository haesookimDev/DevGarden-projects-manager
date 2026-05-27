// Webview side of the Node sidecar lifecycle.
//
// The Rust crate (apps/client/src-tauri/src/sidecar.rs) exposes two Tauri
// commands — start_sidecar / stop_sidecar — and emits every stdout / stderr
// line from the child as `sidecar:event` Tauri events. This module wraps
// both pieces behind a small React hook so the App.tsx surface stays clean.
//
// Status is derived from the JSON the sidecar writes:
//   sidecar:hello                → status = 'starting'
//   sidecar:status connecting    → status = 'connecting'
//   sidecar:status connected     → status = 'running'
//   sidecar:status disconnected  → status = 'disconnected'
//   sidecar:status error         → status = 'error'
//   sidecar:eof / sidecar:shutdown → status = 'stopped'
//   sidecar:run-start            → currentRunId set
//   sidecar:run-end              → currentRunId cleared

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

export type SidecarStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'connecting'; apiBaseUrl?: string }
  | { kind: 'running'; since: string }
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'error'; message: string }
  | { kind: 'stopped' };

export interface SidecarSnapshot {
  status: SidecarStatus;
  currentRunId: string | null;
  /** Last `sidecar:stderr` line, useful for quick diagnostics. */
  lastStderr: string | null;
}

const INITIAL: SidecarSnapshot = {
  status: { kind: 'idle' },
  currentRunId: null,
  lastStderr: null,
};

// The Rust event channel — kept in sync with sidecar.rs SIDECAR_EVENT.
const SIDECAR_EVENT = 'sidecar:event';

interface RawEvent {
  type?: string;
  status?: string;
  message?: string;
  reason?: string;
  apiBaseUrl?: string;
  runId?: string;
  since?: string;
  line?: string;
  raw?: string;
}

export function reduceSidecarEvent(prev: SidecarSnapshot, evt: RawEvent): SidecarSnapshot {
  switch (evt.type) {
    case 'sidecar:hello':
      return { ...prev, status: { kind: 'starting' } };
    case 'sidecar:status':
      switch (evt.status) {
        case 'connecting':
          return {
            ...prev,
            status: {
              kind: 'connecting',
              ...(evt.apiBaseUrl ? { apiBaseUrl: evt.apiBaseUrl } : {}),
            },
          };
        case 'connected':
          return {
            ...prev,
            status: { kind: 'running', since: evt.since ?? new Date().toISOString() },
          };
        case 'disconnected':
          return {
            ...prev,
            status: { kind: 'disconnected', ...(evt.reason ? { reason: evt.reason } : {}) },
          };
        case 'error':
          return { ...prev, status: { kind: 'error', message: evt.message ?? 'unknown error' } };
        default:
          return prev;
      }
    case 'sidecar:run-start':
      return { ...prev, currentRunId: evt.runId ?? null };
    case 'sidecar:run-end':
      return { ...prev, currentRunId: null };
    case 'sidecar:error':
      return {
        ...prev,
        status: { kind: 'error', message: evt.message ?? 'unknown error' },
      };
    case 'sidecar:eof':
    case 'sidecar:shutdown':
      return { ...prev, status: { kind: 'stopped' } };
    case 'sidecar:stderr':
      return { ...prev, lastStderr: evt.line ?? null };
    default:
      return prev;
  }
}

export interface SidecarApi {
  start(args: { apiBaseUrl: string; jwt: string }): Promise<void>;
  stop(): Promise<void>;
}

const defaultApi: SidecarApi = {
  start({ apiBaseUrl, jwt }) {
    return invoke<void>('start_sidecar', { apiBaseUrl, jwt });
  },
  stop() {
    return invoke<void>('stop_sidecar');
  },
};

export interface UseSidecarDeps {
  api?: SidecarApi;
  /** Tauri listen() — injected so unit tests can drive events manually. */
  listen?: typeof listen;
}

export function useSidecar(deps: UseSidecarDeps = {}): SidecarSnapshot & {
  start: SidecarApi['start'];
  stop: SidecarApi['stop'];
} {
  const api = deps.api ?? defaultApi;
  const listenFn = deps.listen ?? listen;
  const [snapshot, setSnapshot] = useState<SidecarSnapshot>(INITIAL);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listenFn<RawEvent>(SIDECAR_EVENT, (event) => {
      setSnapshot((prev) => reduceSidecarEvent(prev, event.payload ?? {}));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [listenFn]);

  return {
    ...snapshot,
    start: api.start,
    stop: api.stop,
  };
}
