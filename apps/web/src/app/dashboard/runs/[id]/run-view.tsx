'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@devgarden/ui';
import type { RunDetail, RunLogRow, RunStepRow } from '@/lib/api/runs';
import { TimelineTab } from './timeline-tab';

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

type Tab = 'detail' | 'timeline';

export function RunView({ initial }: { initial: RunDetail }) {
  const [run, setRun] = useState<RunDetail>(initial);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [tab, setTab] = useState<Tab>('detail');
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
      <header className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">Run {run.id.slice(0, 8)}</h1>
        <div className="flex items-center gap-2">
          <LivePill connected={liveConnected} terminal={TERMINAL.includes(run.status)} />
          <StatusPill status={run.status} />
        </div>
      </header>

      <section className="mt-4 text-sm text-muted-foreground">
        <p>started: {new Date(run.startedAt).toLocaleString()}</p>
        {run.finishedAt && <p>finished: {new Date(run.finishedAt).toLocaleString()}</p>}
        {run.branchName && <p>branch: {run.branchName}</p>}
        {error && (
          <p className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </section>

      <nav className="mt-6 flex gap-1 border-b border-border" data-testid="run-tabs">
        <TabButton
          active={tab === 'detail'}
          onClick={() => setTab('detail')}
          testId="run-tab-detail"
        >
          Steps &amp; logs
        </TabButton>
        <TabButton
          active={tab === 'timeline'}
          onClick={() => setTab('timeline')}
          testId="run-tab-timeline"
        >
          Timeline
        </TabButton>
      </nav>

      {tab === 'timeline' ? (
        <section className="mt-6">
          <TimelineTab runId={run.id} />
        </section>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Steps ({run.steps.length})</h2>
            {run.steps.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">아직 실행된 step 이 없습니다.</p>
            )}
            {run.steps.length > 0 && (
              <Card className="mt-2 overflow-hidden p-0">
                <CardContent className="p-0">
                  <ul data-testid="run-steps" className="divide-y divide-border">
                    {run.steps.map((s) => (
                      <li key={s.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-sm">
                            #{s.stepIndex} {s.stepId} ({s.kind.toLowerCase()})
                          </p>
                          <StatusPill status={s.status as RunDetail['status']} />
                        </div>
                        {s.error && <p className="mt-1 text-xs text-destructive">{s.error}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.durationMs !== null ? `${s.durationMs} ms` : 'running…'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">Logs ({run.logs.length})</h2>
            {run.logs.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">로그가 아직 없습니다.</p>
            )}
            {run.logs.length > 0 && (
              <pre
                data-testid="run-logs"
                className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
              >
                {run.logs.map((l) => (
                  <div key={l.id}>
                    <span className="text-muted-foreground">
                      [{new Date(l.ts).toLocaleTimeString()}] {l.level.padEnd(5)} {l.source}
                    </span>{' '}
                    {l.message}
                  </div>
                ))}
              </pre>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? '1' : '0'}
      className={
        'border-b-2 px-3 py-2 text-sm transition-colors ' +
        (active
          ? 'border-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}

function LivePill({ connected, terminal }: { connected: boolean; terminal: boolean }) {
  if (terminal) return null;
  return (
    <span
      data-testid={connected ? 'run-live-connected' : 'run-live-disconnected'}
      className={
        connected
          ? 'rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-500'
          : 'rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
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
  const cls = statusClass(status);
  return (
    <span
      data-testid={`run-status-${status.toLowerCase()}`}
      className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-500';
    case 'SUCCESS':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
    case 'FAILED':
      return 'border-destructive/50 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}
