import { interpolate, type ExprContext } from './expr';
import type {
  ConditionStep,
  Harness,
  LlmStep,
  LoopStep,
  Step,
  SubagentStep,
  ToolStep,
} from './schema';
import type { RunHooks, RunOptions, RunResult, StepResult, ToolHandler } from './runner-types';

export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerError';
  }
}

/**
 * Thrown internally when `opts.signal` aborts mid-run. `runHarness` catches it
 * and resolves with status 'cancelled' (vs. 'failed') so callers can tell a
 * deliberate cancel apart from an error.
 */
export class CancelledError extends Error {
  constructor(message = 'run cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

interface ExecState {
  inputs: Record<string, unknown>;
  stepsOut: Record<string, unknown>;
  results: StepResult[];
}

export async function runHarness(harness: Harness, opts: RunOptions): Promise<RunResult> {
  const maxIterations = opts.maxIterations ?? 10;
  const state: ExecState = {
    inputs: validateInputs(harness, opts.inputs ?? {}),
    stepsOut: {},
    results: [],
  };

  try {
    await runSteps(harness.steps, state, opts, maxIterations);
    return { runId: opts.runId, status: 'success', steps: state.results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CancelledError) {
      emit(opts.hooks, 'warn', 'system', message);
      return { runId: opts.runId, status: 'cancelled', steps: state.results, error: message };
    }
    return {
      runId: opts.runId,
      status: 'failed',
      steps: state.results,
      error: message,
    };
  }
}

function validateInputs(harness: Harness, given: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const input of harness.inputs ?? []) {
    const provided = Object.prototype.hasOwnProperty.call(given, input.name);
    if (!provided) {
      if (input.default !== undefined) out[input.name] = input.default;
      else if (input.required) throw new RunnerError(`Missing required input: ${input.name}`);
      continue;
    }
    out[input.name] = given[input.name];
  }
  return out;
}

async function runSteps(
  steps: Step[],
  state: ExecState,
  opts: RunOptions,
  maxIterations: number,
): Promise<void> {
  for (const step of steps) {
    await runOneStep(step, state, opts, maxIterations);
  }
}

async function runOneStep(
  step: Step,
  state: ExecState,
  opts: RunOptions,
  maxIterations: number,
): Promise<void> {
  // Refuse to start a new step once the run has been cancelled.
  if (opts.signal?.aborted) throw new CancelledError();
  opts.hooks?.onStepStart?.(step);
  emit(opts.hooks, 'info', step.id, `step ${step.type} starting`);
  const started = Date.now();
  const retries = parseRetry(step.onFail);

  let attempt = 0;
  // attempt + retries: total tries
  while (true) {
    try {
      const output = await dispatch(step, state, opts, maxIterations);
      const result: StepResult = {
        stepId: step.id,
        status: 'success',
        output,
        durationMs: Date.now() - started,
      };
      state.stepsOut[step.id] = output;
      state.results.push(result);
      opts.hooks?.onStepFinish?.(result);
      return;
    } catch (err) {
      // A tool that was killed by the cancel signal surfaces as an error; treat
      // it as a cancellation (don't retry, don't honor onFail:continue).
      if (opts.signal?.aborted) throw new CancelledError();
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        attempt += 1;
        emit(
          opts.hooks,
          'warn',
          step.id,
          `step failed (attempt ${attempt}/${retries}): ${message}`,
        );
        continue;
      }
      const result: StepResult = {
        stepId: step.id,
        status: 'failed',
        error: message,
        durationMs: Date.now() - started,
      };
      state.results.push(result);
      opts.hooks?.onStepFinish?.(result);
      if (step.onFail === 'continue') {
        emit(opts.hooks, 'warn', step.id, `step failed, continuing per onFail: ${message}`);
        return;
      }
      throw new RunnerError(`step ${step.id} failed: ${message}`);
    }
  }
}

function parseRetry(onFail: string | undefined): number {
  if (!onFail) return 0;
  const m = onFail.match(/^retry\((\d+)\)$/);
  return m ? Number(m[1]) : 0;
}

async function dispatch(
  step: Step,
  state: ExecState,
  opts: RunOptions,
  maxIterations: number,
): Promise<unknown> {
  const ctx = buildExprContext(state, opts);
  switch (step.type) {
    case 'tool':
      return runToolStep(step, ctx, opts);
    case 'llm':
      return runLlmStep(step, ctx, opts);
    case 'subagent':
      return runSubagentStep(step, ctx, opts, maxIterations);
    case 'condition':
      return runConditionStep(step, ctx, state, opts, maxIterations);
    case 'loop':
      return runLoopStep(step, state, opts, maxIterations);
  }
}

async function runToolStep(step: ToolStep, ctx: ExprContext, opts: RunOptions): Promise<unknown> {
  const handler = lookupTool(step.use, opts.tools);
  const args = interpolateRecord(step.with ?? {}, ctx);
  return handler.run(args, {
    runId: opts.runId,
    workingDir: opts.workingDir,
    host: opts.host,
    signal: opts.signal,
  });
}

function lookupTool(use: string, tools: Map<string, ToolHandler>): ToolHandler {
  const handler = tools.get(use);
  if (!handler) throw new RunnerError(`unknown tool: ${use}`);
  return handler;
}

async function runLlmStep(step: LlmStep, ctx: ExprContext, opts: RunOptions): Promise<unknown> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (step.system) {
    messages.push({ role: 'system', content: String(interpolate(step.system, ctx)) });
  }
  messages.push({ role: 'user', content: String(interpolate(step.prompt, ctx)) });

  const res = await opts.llm.chat({
    provider: step.provider,
    model: step.model,
    messages,
  });
  return { output: res.text, tokens: res.tokens };
}

async function runSubagentStep(
  step: SubagentStep,
  ctx: ExprContext,
  opts: RunOptions,
  maxIterations: number,
): Promise<unknown> {
  if (!opts.subagent) {
    throw new RunnerError(`subagent step "${step.id}" used but no SubagentDispatch provided`);
  }
  const cap = Math.min(step.maxIterations ?? 1, maxIterations);
  let last: unknown;
  for (let i = 0; i < cap; i++) {
    const input = step.input !== undefined ? interpolateValue(step.input, ctx) : undefined;
    last = await opts.subagent.invoke(step.agent, input);
    if (!step.loopUntil) return last;
    // Re-evaluate loopUntil with the most recent step output bound to a synthetic key.
    const merged: ExprContext = { ...ctx, last };
    const done = !!interpolate(`\${${step.loopUntil}}`, merged);
    if (done) return last;
  }
  return last;
}

async function runConditionStep(
  step: ConditionStep,
  ctx: ExprContext,
  state: ExecState,
  opts: RunOptions,
  maxIterations: number,
): Promise<unknown> {
  const truthy = !!interpolate(`\${${step.when}}`, ctx);
  if (truthy) {
    await runSteps(step.then, state, opts, maxIterations);
    return { branch: 'then' };
  }
  if (step.else) {
    await runSteps(step.else, state, opts, maxIterations);
    return { branch: 'else' };
  }
  return { branch: 'skipped' };
}

async function runLoopStep(
  step: LoopStep,
  state: ExecState,
  opts: RunOptions,
  maxIterations: number,
): Promise<unknown> {
  const cap = Math.min(step.maxIterations, maxIterations);
  let iterations = 0;
  while (iterations < cap) {
    const ctx = buildExprContext(state, opts);
    const cond = !!interpolate(`\${${step.while}}`, ctx);
    if (!cond) break;
    await runSteps(step.do, state, opts, maxIterations);
    iterations++;
  }
  return { iterations };
}

function buildExprContext(state: ExecState, opts: RunOptions): ExprContext {
  return {
    inputs: state.inputs,
    steps: state.stepsOut,
    run: { id: opts.runId, workingDir: opts.workingDir },
  };
}

function interpolateRecord(
  record: Record<string, unknown>,
  ctx: ExprContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = interpolateValue(v, ctx);
  }
  return out;
}

function interpolateValue(value: unknown, ctx: ExprContext): unknown {
  if (typeof value === 'string') return interpolate(value, ctx);
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, ctx));
  if (value && typeof value === 'object') {
    return interpolateRecord(value as Record<string, unknown>, ctx);
  }
  return value;
}

function emit(
  hooks: RunHooks | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  source: string,
  message: string,
): void {
  hooks?.onLog?.({ ts: new Date().toISOString(), level, source, message });
}
