'use client';

// Run step Gantt. Fetches /api/runs/[id]/timeline on demand (when the tab is
// shown) and renders a horizontal bar per step positioned by startOffsetMs /
// durationMs against the run's total span. A pure-CSS layout (absolutely
// positioned bars) keeps this off Recharts — a Gantt is just positioned bars
// and this avoids the SSR/hydration friction Recharts has under the app
// router. The longest step is highlighted.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { RunTimeline } from '@/lib/api/runs';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; timeline: RunTimeline };

export function TimelineTab({ runId }: { runId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void fetch(`/api/runs/${encodeURIComponent(runId)}/timeline`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as RunTimeline;
      })
      .then((timeline) => {
        if (!cancelled) setState({ kind: 'ready', timeline });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' });
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (state.kind === 'loading') {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="run-timeline-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p
        className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        data-testid="run-timeline-error"
      >
        {state.message}
      </p>
    );
  }

  const { timeline } = state;
  if (timeline.steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="run-timeline-empty">
        아직 실행된 step 이 없습니다.
      </p>
    );
  }

  // Avoid divide-by-zero; a single instant run still renders a full-width bar.
  const total = timeline.totalMs > 0 ? timeline.totalMs : 1;

  return (
    <div className="space-y-2" data-testid="run-timeline">
      <p className="text-xs text-muted-foreground">
        total {formatMs(timeline.totalMs)} · {timeline.steps.length} steps
      </p>
      <ul className="space-y-1.5">
        {timeline.steps.map((s) => {
          const leftPct = (s.startOffsetMs / total) * 100;
          // Floor the visible width so even a 0ms bar is clickable/visible.
          const widthPct = Math.max(1.5, (s.durationMs / total) * 100);
          const isLongest = s.stepIndex === timeline.longestStepIndex;
          return (
            <li
              key={s.stepIndex}
              className="grid grid-cols-[140px_1fr] items-center gap-2"
              data-testid="run-timeline-row"
              data-step-id={s.stepId}
              data-longest={isLongest ? '1' : '0'}
            >
              <span className="truncate font-mono text-xs" title={s.stepId}>
                #{s.stepIndex} {s.stepId}
              </span>
              <div className="relative h-5 rounded bg-muted/40">
                <div
                  className={
                    'absolute top-0 h-5 rounded ' +
                    (isLongest ? 'bg-amber-500/70' : barClass(s.status))
                  }
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`${s.stepId} · ${formatMs(s.durationMs)}`}
                />
                <span className="absolute right-1 top-0 text-[10px] leading-5 text-muted-foreground">
                  {formatMs(s.durationMs)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {timeline.longestStepIndex !== null && (
        <p className="text-[11px] text-amber-500" data-testid="run-timeline-longest">
          가장 오래 걸린 step: #{timeline.longestStepIndex}
        </p>
      )}
    </div>
  );
}

function barClass(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-emerald-500/60';
    case 'FAILED':
      return 'bg-destructive/60';
    case 'RUNNING':
      return 'bg-amber-500/50';
    default:
      return 'bg-muted-foreground/40';
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
