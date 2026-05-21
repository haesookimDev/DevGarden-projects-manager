import { describe, expect, it, vi } from 'vitest';
import { RUN_EVENTS } from '@devgarden/shared';
import { executeRun, type RunExecutorSocket } from './run-executor';

function fakeSocket() {
  const emit = vi.fn();
  const socket: RunExecutorSocket = { emit };
  return { socket, emit };
}

const sampleHarness = {
  name: 'echo',
  version: 1,
  steps: [{ id: 'plan', type: 'tool', use: 'fs.write', with: { path: 'a.txt', content: 'hi' } }],
};

describe('executeRun', () => {
  it('emits RUNNING → STEP → SUCCESS on a happy harness', async () => {
    const { socket, emit } = fakeSocket();
    const tools = new Map();
    const run = vi.fn().mockResolvedValue({
      runId: 'run-1',
      status: 'success',
      steps: [{ stepId: 'plan', status: 'success', durationMs: 12, output: { ok: true } }],
    });

    const result = await executeRun(
      socket,
      {
        runId: 'run-1',
        harness: sampleHarness,
        inputs: { name: 'demo' },
        workingDir: '/tmp/x',
      },
      { run, buildTools: () => tools },
    );

    expect(result?.status).toBe('success');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'echo' }),
      expect.objectContaining({
        runId: 'run-1',
        workingDir: '/tmp/x',
        tools,
        inputs: { name: 'demo' },
      }),
    );

    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toEqual([
      RUN_EVENTS.Status, // RUNNING
      RUN_EVENTS.Status, // SUCCESS
    ]);

    // Drive a step finish via the hooks the executor installed.
    const passedOpts = run.mock.calls[0]![1];
    passedOpts.hooks.onLog({
      ts: '2026-01-01T00:00:00.000Z',
      level: 'info',
      source: 'plan',
      message: 'wrote file',
    });
    passedOpts.hooks.onStepFinish({
      stepId: 'plan',
      status: 'success',
      durationMs: 12,
      output: { ok: true },
    });

    const log = emit.mock.calls.find((c) => c[0] === RUN_EVENTS.Log)?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(log).toMatchObject({
      runId: 'run-1',
      level: 'info',
      source: 'plan',
      message: 'wrote file',
    });

    const step = emit.mock.calls.find((c) => c[0] === RUN_EVENTS.Step)?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(step).toMatchObject({
      runId: 'run-1',
      stepIndex: 0,
      stepId: 'plan',
      kind: 'TOOL',
      status: 'SUCCESS',
    });
  });

  it('reports FAILED + error log when harness parse fails', async () => {
    const { socket, emit } = fakeSocket();
    const run = vi.fn();
    const result = await executeRun(
      socket,
      { runId: 'run-2', harness: { broken: true }, inputs: {}, workingDir: '/tmp/x' },
      {
        run,
        buildTools: () => new Map(),
        parse: () => {
          throw new Error('schema invalid');
        },
      },
    );
    expect(result).toBeNull();
    expect(run).not.toHaveBeenCalled();

    const statusCalls = emit.mock.calls.filter((c) => c[0] === RUN_EVENTS.Status);
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]![1]).toEqual({ runId: 'run-2', status: 'FAILED' });

    const log = emit.mock.calls.find((c) => c[0] === RUN_EVENTS.Log)?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(log?.message).toMatch(/schema invalid/);
  });

  it('reports FAILED when workingDir is missing', async () => {
    const { socket, emit } = fakeSocket();
    const run = vi.fn();
    const result = await executeRun(
      socket,
      { runId: 'run-3', harness: sampleHarness, inputs: {} },
      { run, buildTools: () => new Map(), parse: () => sampleHarness as never },
    );
    expect(result).toBeNull();
    expect(emit.mock.calls[0]).toEqual([RUN_EVENTS.Status, { runId: 'run-3', status: 'FAILED' }]);
  });

  it('forwards run.error as a final error log when harness returns failed', async () => {
    const { socket, emit } = fakeSocket();
    const run = vi.fn().mockResolvedValue({
      runId: 'run-4',
      status: 'failed',
      steps: [],
      error: 'tool blew up',
    });
    await executeRun(
      socket,
      { runId: 'run-4', harness: sampleHarness, inputs: {}, workingDir: '/tmp/x' },
      { run, buildTools: () => new Map() },
    );
    const lastStatus = emit.mock.calls.filter((c) => c[0] === RUN_EVENTS.Status).at(-1);
    expect(lastStatus?.[1]).toEqual({ runId: 'run-4', status: 'FAILED' });
    const errorLog = emit.mock.calls.filter((c) => c[0] === RUN_EVENTS.Log).at(-1);
    expect((errorLog?.[1] as { message: string }).message).toBe('tool blew up');
  });
});
