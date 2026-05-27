import { internalFetch } from './internal';

// Wire-side shape of the N4 PR3 endpoint result. The api returns one of
// these three union variants depending on whether the YAML parsed and
// whether the runner reached the end.

export interface DryRunStep {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
  tokens?: { input: number; output: number };
}

export interface DryRunLog {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface DryRunLlmCall {
  stepId: string;
  prompt: string;
  system?: string;
}

export interface DryRunToolCall {
  stepId: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface DryRunSchemaIssue {
  path: string;
  message: string;
}

export type DryRunResult =
  | {
      ok: true;
      harness: { name: string; version: number; description?: string };
      steps: DryRunStep[];
      logs: DryRunLog[];
      llmCalls: DryRunLlmCall[];
      toolCalls: DryRunToolCall[];
    }
  | { ok: false; kind: 'parse'; message: string; issues: DryRunSchemaIssue[] }
  | { ok: false; kind: 'runtime'; message: string; steps: DryRunStep[]; logs: DryRunLog[] };

export interface DryRunInput {
  yaml?: string;
  definition?: unknown;
  inputs?: Record<string, unknown>;
}

export async function dryRunHarness(input: DryRunInput): Promise<DryRunResult> {
  const res = await internalFetch('/internal/harnesses/dry-run', { method: 'POST', body: input });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`dryRunHarness failed: ${res.status} ${text}`);
  }
  return (await res.json()) as DryRunResult;
}
