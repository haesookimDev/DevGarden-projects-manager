// Dry-run a harness definition without any side effects.
//
// The api parses the YAML (via @devgarden/harness-core), reports any schema
// errors back to the editor, and — if the definition is valid — runs it
// through harness-core's runner with fake LLM + fake tool + fake subagent
// dispatchers. The "result" is just the shape of the run: which steps would
// execute, in what order, what the LLM prompt would look like after
// interpolation, what a tool would have been called with. No git, no fs, no
// network.
//
// Operators see this in the editor's right-side preview panel before they
// save (PR7 wires the UI). It's the cheapest way to surface "you wrote
// ${steps.foo.output} but there is no step `foo`" without an actual run.

import { Injectable } from '@nestjs/common';
import {
  HarnessParseError,
  parseHarness,
  parseHarnessRaw,
  runHarness,
  type Harness,
  type LlmDispatch,
  type RunLogEvent,
  type StepResult,
  type SubagentDispatch,
  type ToolHandler,
} from '@devgarden/harness-core';

export interface DryRunInput {
  /** Either yaml or definition must be set. If both, yaml wins. */
  yaml?: string;
  definition?: unknown;
  /** Inputs the operator would pass at run time. Optional. */
  inputs?: Record<string, unknown>;
}

export interface DryRunSchemaIssue {
  path: string;
  message: string;
}

export type DryRunOutcome =
  | {
      ok: true;
      harness: Pick<Harness, 'name' | 'version' | 'description'>;
      steps: StepResult[];
      logs: RunLogEvent[];
      llmCalls: Array<{ stepId: string; prompt: string; system?: string }>;
      toolCalls: Array<{ stepId: string; tool: string; input: Record<string, unknown> }>;
    }
  | {
      ok: false;
      kind: 'parse';
      message: string;
      issues: DryRunSchemaIssue[];
    }
  | {
      ok: false;
      kind: 'runtime';
      message: string;
      steps: StepResult[];
      logs: RunLogEvent[];
    };

@Injectable()
export class HarnessDryRunService {
  async run(input: DryRunInput): Promise<DryRunOutcome> {
    let harness: Harness;
    try {
      harness = input.yaml ? parseHarness(input.yaml) : parseHarnessRaw(input.definition);
    } catch (err) {
      if (err instanceof HarnessParseError) {
        return {
          ok: false,
          kind: 'parse',
          message: err.message,
          issues: toIssues(err.issues),
        };
      }
      throw err;
    }

    const llmCalls: Array<{ stepId: string; prompt: string; system?: string }> = [];
    const toolCalls: Array<{ stepId: string; tool: string; input: Record<string, unknown> }> = [];
    const logs: RunLogEvent[] = [];
    const stepResults: StepResult[] = [];

    const llm: LlmDispatch = {
      async chat(req) {
        const last = req.messages.at(-1);
        const system = req.messages.find((m) => m.role === 'system');
        // The runner records this call in toolCalls/llmCalls because the
        // step's id is in scope; from inside dispatch we only know what was
        // passed to chat, so we attach the prompt + system here.
        llmCalls.push({
          stepId: '(unknown)',
          prompt: last?.content ?? '',
          ...(system ? { system: system.content } : {}),
        });
        return { text: '[dry-run] llm response placeholder', tokens: { input: 0, output: 0 } };
      },
    };

    // Build a tool registry that captures every call without touching the
    // outside world. The runner expects a Map<string, ToolHandler>.
    const tools = new Map<string, ToolHandler>();
    const recordingHandler = (name: string): ToolHandler => ({
      name,
      async run(input: Record<string, unknown>) {
        toolCalls.push({ stepId: '(unknown)', tool: name, input });
        // Echo the input back as output so downstream `${steps.X.foo}`
        // references resolve to something sensible during the dry-run.
        return { ...input, _dryRun: true };
      },
    });

    // Pre-register every tool name referenced by the harness so the runner
    // doesn't fail on "unknown tool" before reaching the recording handler.
    for (const step of harness.steps) {
      if (step.type === 'tool' && step.use) {
        tools.set(step.use, recordingHandler(step.use));
      }
    }

    const subagent: SubagentDispatch = {
      async invoke(agent, _agentInput) {
        return { _dryRun: true, agent };
      },
    };

    try {
      const result = await runHarness(harness, {
        runId: 'dry-run',
        inputs: input.inputs ?? {},
        llm,
        tools,
        subagent,
        hooks: {
          onLog(event) {
            logs.push(event);
          },
          onStepFinish(step) {
            stepResults.push(step);
            // Attribute the most recent llm/tool call to this step id.
            for (let i = llmCalls.length - 1; i >= 0; i--) {
              const entry = llmCalls[i]!;
              if (entry.stepId === '(unknown)') {
                entry.stepId = step.stepId;
                break;
              }
            }
            for (let i = toolCalls.length - 1; i >= 0; i--) {
              const entry = toolCalls[i]!;
              if (entry.stepId === '(unknown)') {
                entry.stepId = step.stepId;
                break;
              }
            }
          },
        },
      });

      if (result.status === 'failed') {
        return {
          ok: false,
          kind: 'runtime',
          message: result.error ?? 'dry-run runner reported failure',
          steps: result.steps,
          logs,
        };
      }

      return {
        ok: true,
        harness: {
          name: harness.name,
          version: harness.version,
          description: harness.description,
        },
        steps: result.steps,
        logs,
        llmCalls,
        toolCalls,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        kind: 'runtime',
        message,
        steps: stepResults,
        logs,
      };
    }
  }
}

function toIssues(issues: unknown): DryRunSchemaIssue[] {
  if (!Array.isArray(issues)) return [];
  return issues
    .map((i): DryRunSchemaIssue | null => {
      if (!i || typeof i !== 'object') return null;
      const rec = i as { path?: unknown; message?: unknown };
      const path = Array.isArray(rec.path) ? rec.path.join('.') : '';
      const message = typeof rec.message === 'string' ? rec.message : '';
      if (!message) return null;
      return { path, message };
    })
    .filter((x): x is DryRunSchemaIssue => x !== null);
}
