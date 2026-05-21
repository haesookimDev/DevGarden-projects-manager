// Socket.io event payloads exchanged between api and the desktop client over
// the `/clients` namespace. Used by both sides so the contract is single-sourced.

export const RUN_EVENTS = {
  /** api → client: start executing a harness for the given run. */
  Start: 'run:start',
  /** client → api: append a log line to the run. */
  Log: 'run:log',
  /** client → api: append a step result to the run. */
  Step: 'run:step',
  /** client → api: transition the run's lifecycle status. */
  Status: 'run:status',
} as const;

export type RunEvent = (typeof RUN_EVENTS)[keyof typeof RUN_EVENTS];

export interface RunStartPayload {
  runId: string;
  /** Raw harness definition (as stored in DB); the client parses it. */
  harness: unknown;
  inputs: Record<string, unknown>;
  workingDir?: string;
}

export interface RunLogPayload {
  runId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface RunStepPayload {
  runId: string;
  stepIndex: number;
  stepId: string;
  kind: 'TOOL' | 'LLM' | 'SUBAGENT' | 'CONDITION' | 'LOOP';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface RunStatusPayload {
  runId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
}
