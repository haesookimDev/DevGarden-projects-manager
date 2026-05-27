'use client';

// DryRunPanel — the editor's right-side preview. Operator clicks "Dry-run"
// and sees the steps the harness would execute, what the LLM prompt looks
// like after interpolation, and what each tool would be called with — all
// without touching git, fs, or the LLM provider.

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@devgarden/ui';
import { AlertTriangle, CheckCircle2, Loader2, Play } from 'lucide-react';
import type {
  DryRunLlmCall,
  DryRunResult,
  DryRunStep,
  DryRunToolCall,
} from '@/lib/api/harness-dry-run';

interface DryRunPanelProps {
  /** Returns the YAML currently in the editor. Called when the operator
   *  clicks Dry-run so the panel sees the latest draft. */
  getYaml(): string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'done'; result: DryRunResult }
  | { kind: 'error'; message: string };

export function DryRunPanel({ getYaml }: DryRunPanelProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const handleClick = async () => {
    const yaml = getYaml();
    if (!yaml.trim()) {
      setState({ kind: 'error', message: 'editor is empty' });
      return;
    }
    setState({ kind: 'pending' });
    try {
      const res = await fetch('/api/harnesses/dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as DryRunResult;
      setState({ kind: 'done', result });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' });
    }
  };

  return (
    <Card data-testid="harness-dry-run-panel">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dry-run preview
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleClick()}
          disabled={state.kind === 'pending'}
          data-testid="harness-dry-run-button"
        >
          {state.kind === 'pending' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {state.kind === 'pending' ? 'Running…' : 'Dry-run'}
        </Button>
      </CardHeader>
      <CardContent>
        <DryRunBody state={state} />
      </CardContent>
    </Card>
  );
}

function DryRunBody({ state }: { state: State }) {
  if (state.kind === 'idle') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="harness-dry-run-idle">
        실 사이드이펙트 없이 step / LLM prompt / tool call 미리보기.
      </p>
    );
  }
  if (state.kind === 'pending') {
    return <p className="text-xs text-muted-foreground">Running dry-run…</p>;
  }
  if (state.kind === 'error') {
    return (
      <p
        className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        data-testid="harness-dry-run-transport-error"
      >
        {state.message}
      </p>
    );
  }
  return <DryRunResultView result={state.result} />;
}

function DryRunResultView({ result }: { result: DryRunResult }) {
  if (!result.ok && result.kind === 'parse') {
    return (
      <div
        className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        data-testid="harness-dry-run-parse-error"
      >
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          Schema error
        </p>
        <p className="text-xs">{result.message}</p>
        {result.issues.length > 0 && (
          <ul className="list-inside list-disc space-y-1 text-[11px]">
            {result.issues.slice(0, 8).map((i, idx) => (
              <li key={idx}>
                {i.path && <code className="mr-1 font-mono">{i.path}</code>}
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!result.ok && result.kind === 'runtime') {
    return (
      <div
        className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        data-testid="harness-dry-run-runtime-error"
      >
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          Runner error
        </p>
        <p className="text-xs">{result.message}</p>
        <StepsList steps={result.steps} />
      </div>
    );
  }

  if (result.ok) {
    return (
      <div className="space-y-3" data-testid="harness-dry-run-ok">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Dry-run succeeded
        </p>
        <StepsList steps={result.steps} />
        {result.llmCalls.length > 0 && <LlmCallsList calls={result.llmCalls} />}
        {result.toolCalls.length > 0 && <ToolCallsList calls={result.toolCalls} />}
      </div>
    );
  }
  return null;
}

function StepsList({ steps }: { steps: DryRunStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section data-testid="harness-dry-run-steps">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Steps
      </h3>
      <ul className="mt-1 space-y-1">
        {steps.map((s) => (
          <li
            key={s.stepId}
            className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
            data-testid="harness-dry-run-step"
            data-step-id={s.stepId}
            data-step-status={s.status}
          >
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {s.status}
              </Badge>
              <code className="font-mono">{s.stepId}</code>
            </span>
            <span className="text-[10px] text-muted-foreground">{s.durationMs}ms</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LlmCallsList({ calls }: { calls: DryRunLlmCall[] }) {
  return (
    <section data-testid="harness-dry-run-llm-calls">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        LLM calls
      </h3>
      <ul className="mt-1 space-y-2">
        {calls.map((c, i) => (
          <li
            key={i}
            className="rounded-md border border-border p-2 text-xs"
            data-testid="harness-dry-run-llm-call"
          >
            <p>
              <Badge variant="outline" className="mr-1 text-[10px]">
                {c.stepId}
              </Badge>
            </p>
            {c.system && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-muted-foreground">
                  system
                </summary>
                <pre className="mt-1 whitespace-pre-wrap text-[11px]">{c.system}</pre>
              </details>
            )}
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">
              {c.prompt}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolCallsList({ calls }: { calls: DryRunToolCall[] }) {
  return (
    <section data-testid="harness-dry-run-tool-calls">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tool calls
      </h3>
      <ul className="mt-1 space-y-1.5">
        {calls.map((c, i) => (
          <li
            key={i}
            className="rounded-md border border-border p-2 text-xs"
            data-testid="harness-dry-run-tool-call"
          >
            <p className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {c.stepId}
              </Badge>
              <code className="font-mono">{c.tool}</code>
            </p>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre text-[11px]">
              {JSON.stringify(c.input, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
