// Public contract between the harness runner and the host application
// (apps/client). The runner stays pure: all sideeffects — tool execution,
// LLM calls, log delivery — are passed in by the host.

import type { Step } from './schema';

export interface ToolHandler {
  // Tool identifier. Conventionally namespaced, e.g. 'git.commit', 'fs.write'.
  readonly name: string;
  run(input: Record<string, unknown>, ctx: ToolRunContext): Promise<unknown>;
}

/**
 * Bridge for tools that need to round-trip through the host application — e.g.
 * a `github.openPR` tool that must ask the api to talk to the GitHub App.
 * The host (apps/client) implements this on top of socket.io with ack.
 */
export interface HostBridge {
  request<T = unknown>(event: string, payload: unknown, timeoutMs?: number): Promise<T>;
}

export interface ToolRunContext {
  readonly runId: string;
  readonly workingDir?: string;
  readonly host?: HostBridge;
  /** Aborts when the run is cancelled; long-running tools should bail / kill. */
  readonly signal?: AbortSignal;
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
  status: 'success' | 'failed' | 'cancelled';
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
  /** Optional bridge for tools that need to talk to the host app (e.g. github.openPR). */
  host?: HostBridge;
  /** Hard ceiling on `loop` and `subagent` iterations. Defaults to 10. */
  maxIterations?: number;
  /**
   * Cancellation signal. The runner checks it before each step and refuses to
   * advance once aborted; it is also handed to tools (via ToolRunContext) so a
   * long-running tool can kill its work. An aborted run resolves with
   * status 'cancelled' rather than throwing.
   */
  signal?: AbortSignal;
}
