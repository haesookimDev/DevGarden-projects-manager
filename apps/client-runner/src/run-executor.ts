// Bridges a `run:start` socket event to the harness runner.
//
// Responsibilities:
//   - parse the raw harness definition arriving over the wire
//   - build a per-run tool registry scoped to `workingDir`
//   - drive `runHarness`, forwarding every step + log + final status back to
//     the api via `socket.emit`
//
// All sideeffects (parseHarness, runHarness, tool factory, default LLM) are
// injectable so unit tests can drive the lifecycle without touching disk.

import {
  parseHarnessRaw,
  type Harness,
  type HostBridge,
  type LlmDispatch,
  type RunHooks,
  type RunOptions,
  type RunResult,
  type StepResult,
  type ToolHandler,
} from '@devgarden/harness-core';
import {
  RUN_EVENTS,
  type RunLogPayload,
  type RunStartPayload,
  type RunStatusPayload,
  type RunStepPayload,
} from '@devgarden/shared';
import { buildToolRegistry, type ToolRegistryOptions } from './tools/registry';

export interface RunExecutorSocket {
  emit(event: string, payload: unknown): void;
  /** Optional ack-style request used by tools (e.g. github.openPR). */
  emitWithAck?(event: string, payload: unknown): Promise<unknown>;
}

export interface RunExecutorDeps {
  parse?: (raw: unknown) => Harness;
  run?: (harness: Harness, opts: RunOptions) => Promise<RunResult>;
  buildTools?: (opts: ToolRegistryOptions) => Map<string, ToolHandler>;
  /** Default LLM dispatch when the harness has `llm` steps. Tests can stub. */
  llm?: LlmDispatch;
  /** Process allow-list passed to the tool registry. Defaults to ['echo']. */
  processAllowList?: ReadonlyArray<string>;
  /** Fallback workingDir when the run event omits one (rare). */
  fallbackWorkingDir?: string;
}

const NOOP_LLM: LlmDispatch = {
  chat() {
    return Promise.reject(
      new Error('No LLM provider configured for this client; harness used an llm step'),
    );
  },
};

const DEFAULT_PROCESS_ALLOW_LIST: ReadonlyArray<string> = ['echo'];

/**
 * Execute a run announced over the socket. Resolves with the final RunResult.
 * Any unexpected error (e.g. harness parse failure) is reported as a FAILED
 * status before the promise resolves with `null`.
 */
export async function executeRun(
  socket: RunExecutorSocket,
  event: RunStartPayload,
  deps: RunExecutorDeps = {},
): Promise<RunResult | null> {
  const parse = deps.parse ?? parseHarnessRaw;
  const run = deps.run ?? defaultRunHarness();
  const buildTools = deps.buildTools ?? buildToolRegistry;
  const llm = deps.llm ?? NOOP_LLM;
  const allowList = deps.processAllowList ?? DEFAULT_PROCESS_ALLOW_LIST;
  const workingDir = event.workingDir ?? deps.fallbackWorkingDir;

  if (!workingDir) {
    emitStatus(socket, event.runId, 'FAILED');
    emitLog(socket, event.runId, 'error', 'run-executor', 'workingDir is required');
    return null;
  }

  let harness: Harness;
  try {
    harness = parse(event.harness);
  } catch (err) {
    emitStatus(socket, event.runId, 'FAILED');
    emitLog(socket, event.runId, 'error', 'run-executor', `harness parse failed: ${msg(err)}`);
    return null;
  }

  const tools = buildTools({
    policy: { rootDir: workingDir },
    processAllowList: allowList,
  });

  emitStatus(socket, event.runId, 'RUNNING');

  let stepIndex = 0;
  const hooks: RunHooks = {
    onLog: (e) => emitLog(socket, event.runId, e.level, e.source, e.message),
    onStepStart: () => {
      // No-op: a Step row is created on finish so we have the final status +
      // duration in a single write. Start is observable via the log line that
      // runHarness emits before dispatch.
    },
    onStepFinish: (result) => {
      emitStep(socket, event.runId, stepIndex, harness, result);
      stepIndex += 1;
    },
  };

  const host: HostBridge | undefined = socket.emitWithAck
    ? {
        request: async <T>(name: string, payload: unknown) => {
          const ack = (await socket.emitWithAck!(name, payload)) as T;
          return ack;
        },
      }
    : undefined;

  const result = await run(harness, {
    runId: event.runId,
    inputs: event.inputs ?? {},
    llm,
    tools,
    workingDir,
    hooks,
    host,
  });

  emitStatus(socket, event.runId, result.status === 'success' ? 'SUCCESS' : 'FAILED');
  if (result.error) {
    emitLog(socket, event.runId, 'error', 'run-executor', result.error);
  }
  return result;
}

function defaultRunHarness(): (harness: Harness, opts: RunOptions) => Promise<RunResult> {
  // Lazy import to keep the entry module side-effect free for tests that stub
  // the runner.
  return async (harness, opts) => {
    const { runHarness } = await import('@devgarden/harness-core');
    return runHarness(harness, opts);
  };
}

function emitStatus(
  socket: RunExecutorSocket,
  runId: string,
  status: RunStatusPayload['status'],
): void {
  socket.emit(RUN_EVENTS.Status, { runId, status } satisfies RunStatusPayload);
}

function emitLog(
  socket: RunExecutorSocket,
  runId: string,
  level: RunLogPayload['level'],
  source: string,
  message: string,
): void {
  socket.emit(RUN_EVENTS.Log, { runId, level, source, message } satisfies RunLogPayload);
}

function emitStep(
  socket: RunExecutorSocket,
  runId: string,
  stepIndex: number,
  harness: Harness,
  result: StepResult,
): void {
  const kind = lookupKind(harness, result.stepId);
  const status: RunStepPayload['status'] =
    result.status === 'success' ? 'SUCCESS' : result.status === 'failed' ? 'FAILED' : 'SKIPPED';
  socket.emit(RUN_EVENTS.Step, {
    runId,
    stepIndex,
    stepId: result.stepId,
    kind,
    status,
    durationMs: result.durationMs,
    output: result.output,
    error: result.error,
  } satisfies RunStepPayload);
}

function lookupKind(harness: Harness, stepId: string): RunStepPayload['kind'] {
  const found = findStep(harness.steps, stepId);
  if (!found) return 'TOOL';
  switch (found.type) {
    case 'tool':
      return 'TOOL';
    case 'llm':
      return 'LLM';
    case 'subagent':
      return 'SUBAGENT';
    case 'condition':
      return 'CONDITION';
    case 'loop':
      return 'LOOP';
  }
}

function findStep(steps: Harness['steps'], id: string): Harness['steps'][number] | undefined {
  for (const step of steps) {
    if (step.id === id) return step;
    if (step.type === 'condition') {
      const inThen = findStep(step.then, id);
      if (inThen) return inThen;
      if (step.else) {
        const inElse = findStep(step.else, id);
        if (inElse) return inElse;
      }
    } else if (step.type === 'loop') {
      const inDo = findStep(step.do, id);
      if (inDo) return inDo;
    }
  }
  return undefined;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
