import { describe, expect, it, vi } from 'vitest';
import { parseHarnessRaw } from './parser';
import { runHarness } from './runner';
import type { LlmDispatch, ToolHandler } from './runner-types';

function makeLlm(text: string): LlmDispatch {
  return { chat: vi.fn().mockResolvedValue({ text, tokens: { input: 1, output: 2 } }) };
}

function tools(map: Record<string, ToolHandler['run']>): Map<string, ToolHandler> {
  const out = new Map<string, ToolHandler>();
  for (const [name, run] of Object.entries(map)) out.set(name, { name, run });
  return out;
}

describe('runHarness — basic flow', () => {
  it('runs tool then llm and exposes outputs across steps', async () => {
    const echoTool = vi.fn().mockResolvedValue({ value: 42 });
    const llm = makeLlm('done');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        { id: 'a', type: 'tool', use: 'echo', with: { x: 1 } },
        { id: 'b', type: 'llm', prompt: 'previous: ${steps.a.value}' },
      ],
    });

    const result = await runHarness(harness, {
      runId: 'r-1',
      llm,
      tools: tools({ echo: echoTool }),
    });

    expect(result.status).toBe('success');
    expect(result.steps.map((s) => s.status)).toEqual(['success', 'success']);
    expect(echoTool).toHaveBeenCalledWith({ x: 1 }, expect.objectContaining({ runId: 'r-1' }));

    const llmCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(llmCall.messages[0].content).toBe('previous: 42');
  });

  it('interpolates inputs and provides them to tools', async () => {
    const tool = vi.fn().mockResolvedValue('ok');
    const llm = makeLlm('');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      inputs: [{ name: 'issueNumber', type: 'number', required: true }],
      steps: [{ id: 'a', type: 'tool', use: 'gh', with: { issue: '${inputs.issueNumber}' } }],
    });
    await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ gh: tool }),
      inputs: { issueNumber: 17 },
    });
    expect(tool.mock.calls[0]![0]).toEqual({ issue: 17 });
  });
});

describe('runHarness — failure handling', () => {
  it('stops on default onFail and marks run failed', async () => {
    const llm = makeLlm('');
    const tool = vi.fn().mockRejectedValue(new Error('boom'));
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [{ id: 'a', type: 'tool', use: 'gh' }],
    });
    const result = await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ gh: tool }),
    });
    expect(result.status).toBe('failed');
    expect(result.steps[0]!.status).toBe('failed');
  });

  it('continues when onFail is "continue"', async () => {
    const llm = makeLlm('done');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        { id: 'a', type: 'tool', use: 'gh', onFail: 'continue' },
        { id: 'b', type: 'llm', prompt: 'after a' },
      ],
    });
    const result = await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ gh: vi.fn().mockRejectedValue(new Error('oops')) }),
    });
    expect(result.status).toBe('success');
    expect(result.steps.map((s) => s.status)).toEqual(['failed', 'success']);
  });

  it('retries up to N times with onFail: retry(N)', async () => {
    const llm = makeLlm('');
    let calls = 0;
    const flaky = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error('flake'));
      return Promise.resolve('ok');
    });
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [{ id: 'a', type: 'tool', use: 'gh', onFail: 'retry(3)' }],
    });
    const result = await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ gh: flaky }),
    });
    expect(result.status).toBe('success');
    expect(calls).toBe(3);
  });
});

describe('runHarness — cancellation', () => {
  it('returns cancelled without running any step when already aborted', async () => {
    const llm = makeLlm('');
    const tool = vi.fn().mockResolvedValue('ok');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        { id: 'a', type: 'tool', use: 'gh' },
        { id: 'b', type: 'tool', use: 'gh' },
      ],
    });
    const controller = new AbortController();
    controller.abort();

    const result = await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ gh: tool }),
      signal: controller.signal,
    });

    expect(result.status).toBe('cancelled');
    expect(tool).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(0);
  });

  it('stops advancing once cancelled mid-run + hands the signal to tools', async () => {
    const llm = makeLlm('');
    const controller = new AbortController();
    // Step a aborts the run (as a real cancel would), then resolves.
    const stepA = vi.fn().mockImplementation((_args, ctx) => {
      expect(ctx.signal).toBe(controller.signal);
      controller.abort();
      return Promise.resolve('a-done');
    });
    const stepB = vi.fn().mockResolvedValue('b-done');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        { id: 'a', type: 'tool', use: 'first' },
        { id: 'b', type: 'tool', use: 'second' },
      ],
    });

    const result = await runHarness(harness, {
      runId: 'r',
      llm,
      tools: tools({ first: stepA, second: stepB }),
      signal: controller.signal,
    });

    expect(result.status).toBe('cancelled');
    expect(stepA).toHaveBeenCalledTimes(1);
    expect(stepB).not.toHaveBeenCalled();
  });
});

describe('runHarness — condition / loop', () => {
  it('runs the then-branch when condition is true', async () => {
    const a = vi.fn().mockResolvedValue('a-out');
    const inThen = vi.fn().mockResolvedValue('then-out');
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        { id: 'a', type: 'tool', use: 'a' },
        {
          id: 'gate',
          type: 'condition',
          when: 'steps.a == "a-out"',
          then: [{ id: 'inner', type: 'tool', use: 'inner' }],
        },
      ],
    });
    await runHarness(harness, {
      runId: 'r',
      llm: makeLlm(''),
      tools: tools({ a, inner: inThen }),
    });
    expect(inThen).toHaveBeenCalled();
  });

  it('loops while condition is true, capped by maxIterations', async () => {
    let counter = 0;
    const bump = vi.fn().mockImplementation(() => {
      counter += 1;
      return Promise.resolve(counter);
    });
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [
        {
          id: 'l',
          type: 'loop',
          while: 'steps.b != 3',
          maxIterations: 5,
          do: [{ id: 'b', type: 'tool', use: 'bump' }],
        },
      ],
    });
    const result = await runHarness(harness, {
      runId: 'r',
      llm: makeLlm(''),
      tools: tools({ bump }),
    });
    expect(result.status).toBe('success');
    expect(counter).toBe(3);
  });
});

describe('runHarness — hooks', () => {
  it('emits onStepStart, onStepFinish, and onLog', async () => {
    const onStart = vi.fn();
    const onFinish = vi.fn();
    const onLog = vi.fn();
    const harness = parseHarnessRaw({
      name: 'h',
      version: 1,
      steps: [{ id: 'a', type: 'tool', use: 'noop' }],
    });
    await runHarness(harness, {
      runId: 'r',
      llm: makeLlm(''),
      tools: tools({ noop: vi.fn().mockResolvedValue(null) }),
      hooks: { onStepStart: onStart, onStepFinish: onFinish, onLog },
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalled();
  });
});
