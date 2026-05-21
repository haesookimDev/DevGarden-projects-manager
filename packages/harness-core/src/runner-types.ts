// Public contract between the harness runner and the host application
// (apps/client). The runner stays pure: all sideeffects — tool execution,
// LLM calls, log delivery — are passed in by the host.

import type { Step } from './schema';

export interface ToolHandler {
  // Tool identifier. Conventionally namespaced, e.g. 'git.commit', 'fs.write'.
  readonly name: string;
  run(input: Record<string, unknown>, ctx: ToolRunContext): Promise<unknown>;
}

export interface ToolRunContext {
  readonly runId: string;
  readonly workingDir?: string;
}

export interface LlmDispatch {
  chat(req: {
    provider: string | undefined;
    model: string | undefined;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }): Promise<{ text: string; tokens?: { input: number; output: number } }>;
}

export interface SubagentDispatch {
  invoke(agent: string, input: unknown): Promise<unknown>;
}

export interface RunLogEvent {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
  tokens?: { input: number; output: number };
}

export interface RunResult {
  runId: string;
  status: 'success' | 'failed';
  steps: StepResult[];
  error?: string;
}

export interface RunHooks {
  onLog?(event: RunLogEvent): void;
  onStepStart?(step: Step): void;
  onStepFinish?(result: StepResult): void;
}

export interface RunOptions {
  runId: string;
  inputs?: Record<string, unknown>;
  llm: LlmDispatch;
  tools: Map<string, ToolHandler>;
  subagent?: SubagentDispatch;
  workingDir?: string;
  hooks?: RunHooks;
  /** Hard ceiling on `loop` and `subagent` iterations. Defaults to 10. */
  maxIterations?: number;
}
