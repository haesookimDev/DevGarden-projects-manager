'use client';

import { useEffect, useRef, useState } from 'react';
import type { RunDetail, RunLogRow, RunStepRow } from '@/lib/api/runs';

const POLL_INTERVAL_MS = 5_000;

const TERMINAL: Array<RunDetail['status']> = ['SUCCESS', 'FAILED', 'CANCELLED'];

type RunLogEventPayload = {
  runId: string;
  level: string;
  source: string;
  message: string;
};
type RunStepEventPayload = {
  runId: string;
  stepIndex: number;
  stepId: string;
  kind: string;
  status: string;
  durationMs?: number;
  error?: string;
};
type RunStatusEventPayload = {
  runId: string;
  status: RunDetail['status'];
};

export function RunView({ initial }: { initial: RunDetail }) {
  const [run, setRun] = useState<RunDetail>(initial);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  // Monotonic counter so SSE-appended rows have stable React keys without
  // colliding with persisted DB ids.
  const liveSeqRef = useRef(0);

  // ---- SSE (preferred) -----------------------------------------------------
  useEffect(() => {
    if (TERMINAL.includes(run.status)) return;
    const es = new EventSource(`/api/runs/${run.id}/stream`);

    es.addEventListener('open', () => {
      setLiveConnected(true);
      setError(null);
    });
    es.addEventListener('error', () => {
      setLiveConnected(false);
    });
    es.addEventListener('disconnect', () => {
      setLiveConnected(false);
    });

    es.addEventListener('run:log', (evt) => {
      const payload = parse<RunLogEventPayload>((evt as MessageEvent).data);
      if (!payload || payload.runId !== run.id) return;
      const row: RunLogRow = {
        id: `live-log-${liveSeqRef.current++}`,
        ts: new Date().toISOString(),
        level: payload.level.toUpperCase(),
        source: payload.source,
        message: payload.message,
      };
      setRun((prev) => ({ ...prev, logs: [...prev.logs, row] }));
    });

    es.addEventListener('run:step', (evt) => {
      const payload = parse<RunStepEventPayload>((evt as MessageEvent).data);
      if (!payload || payload.runId !== run.id) return;
      const row: RunStepRow = {
        id: `live-step-${liveSeqRef.current++}`,
        stepIndex: payload.stepIndex,
        stepId: payload.stepId,
        kind: payload.kind,
        status: payload.status,
        durationMs: payload.durationMs ?? null,
        error: payload.error ?? null,
        createdAt: new Date().toISOString(),
      };
      setRun((prev) => {
        const existing = prev.steps.findIndex((s) => s.stepIndex === payload.stepIndex);
        const steps = existing >= 0 ? prev.steps.slice() : [...prev.steps, row];
        if (existing >= 0) steps[existing] = row;
        return { ...prev, steps };
      });
    });

    es.addEventListener('run:status', (evt) => {
      const payload = parse<RunStatusEventPayload>((evt as MessageEvent).data);
      if (!payload || payload.runId !== run.id) return;
      setRun((prev) => ({
        ...prev,
        status: payload.status,
        finishedAt: TERMINAL.includes(payload.status) ? new Date().toISOString() : prev.finishedAt,
      }));
      if (TERMINAL.includes(payload.status)) es.close();
    });

    return () => es.close();
  }, [run.id, run.status]);

  // ---- Polling fallback ----------------------------------------------------
  // Cadence intentionally slower than the SSE-less era (5s vs 2s) so we don't
  // hammer the server when SSE is doing the heavy lifting. Still useful for
  // reconciling state if SSE drops mid-run.
  useEffect(() => {
    if (TERMINAL.includes(run.status)) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${run.id}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError(`refresh failed: ${res.status}`);
          return;
        }
        const next = (await res.json()) as RunDetail;
        if (cancelled) return;
        setRun(next);
        setError(null);
        if (TERMINAL.includes(next.status)) clearInterval(id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'refresh error');
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [run.id, run.status]);

  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold">Run {run.id.slice(0, 8)}</h1>
        <div className="flex items-center gap-2">
          <LivePill connected={liveConnected} terminal={TERMINAL.includes(run.status)} />
          <StatusPill status={run.status} />
        </div>
      </header>

      <section className="mt-4 text-sm text-neutral-400">
        <p>started: {new Date(run.startedAt).toLocaleString()}</p>
        {run.finishedAt && <p>finished: {new Date(run.finishedAt).toLocaleString()}</p>}
        {run.branchName && <p>branch: {run.branchName}</p>}
        {error && (
          <p className="mt-2 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Steps ({run.steps.length})</h2>
        {run.steps.length === 0 && (
          <p className="mt-2 text-sm text-neutral-500">아직 실행된 step 이 없습니다.</p>
        )}
        {run.steps.length > 0 && (
          <ul
            data-testid="run-steps"
            className="mt-2 divide-y divide-neutral-800 rounded-md border border-neutral-800"
          >
            {run.steps.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm">
                    #{s.stepIndex} {s.stepId} ({s.kind.toLowerCase()})
                  </p>
                  <StatusPill status={s.status as RunDetail['status']} />
                </div>
                {s.error && <p className="mt-1 text-xs text-red-300">{s.error}</p>}
                <p className="mt-1 text-xs text-neutral-500">
                  {s.durationMs !== null ? `${s.durationMs} ms` : 'running…'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Logs ({run.logs.length})</h2>
        {run.logs.length === 0 && (
          <p className="mt-2 text-sm text-neutral-500">로그가 아직 없습니다.</p>
        )}
        {run.logs.length > 0 && (
          <pre
            data-testid="run-logs"
            className="mt-2 max-h-96 overflow-auto rounded-md border border-neutral-800 bg-black/40 p-3 font-mono text-xs text-neutral-200"
          >
            {run.logs.map((l) => (
              <div key={l.id}>
                <span className="text-neutral-500">
                  [{new Date(l.ts).toLocaleTimeString()}] {l.level.padEnd(5)} {l.source}
                </span>{' '}
                {l.message}
              </div>
            ))}
          </pre>
        )}
      </section>
    </main>
  );
}

function LivePill({ connected, terminal }: { connected: boolean; terminal: boolean }) {
  if (terminal) return null;
  return (
    <span
      data-testid={connected ? 'run-live-connected' : 'run-live-disconnected'}
      className={`rounded-full px-2 py-0.5 text-xs ${connected ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}
    >
      ● {connected ? 'live' : 'reconnecting…'}
    </span>
  );
}

function parse<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED: 'bg-neutral-800 text-neutral-300',
    RUNNING: 'bg-amber-950 text-amber-200',
    SUCCESS: 'bg-emerald-950 text-emerald-300',
    FAILED: 'bg-red-950 text-red-200',
    CANCELLED: 'bg-neutral-800 text-neutral-400',
    PENDING: 'bg-neutral-800 text-neutral-300',
    SKIPPED: 'bg-neutral-800 text-neutral-500',
  };
  const cls = map[status] ?? 'bg-neutral-800 text-neutral-400';
  return (
    <span
      data-testid={`run-status-${status.toLowerCase()}`}
      className={`rounded-full px-2 py-0.5 text-xs ${cls}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
