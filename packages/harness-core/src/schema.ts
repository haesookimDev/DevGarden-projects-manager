// zod schema for the harness v1 format. The source of truth is
// docs/HARNESS-FORMAT.md; any change here must be mirrored there.

import { z } from 'zod';

export const HARNESS_SCHEMA_VERSION = 1;

const OnFail = z
  .union([z.literal('stop'), z.literal('continue'), z.string().regex(/^retry\(\d+\)$/)])
  .default('stop');

const Input = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean']),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
});

const Defaults = z
  .object({
    llm: z
      .object({
        provider: z.string(),
        model: z.string(),
      })
      .optional(),
  })
  .partial();

const Permissions = z
  .object({
    fs: z.object({ allow: z.array(z.string()).optional(), deny: z.array(z.string()).optional() }),
    process: z.object({ allow: z.array(z.string()) }),
    network: z.object({ allow: z.array(z.string()) }).optional(),
  })
  .partial();

const Hooks = z
  .object({
    preCommit: z.string().optional(),
    prePush: z.string().optional(),
    postRun: z.string().optional(),
  })
  .partial();

const Rules = z
  .object({
    permissions: Permissions.optional(),
    policies: z.array(z.string()).optional(),
    hooks: Hooks.optional(),
  })
  .partial();

// Hand-written step types so we can express the recursive condition/loop steps.

export interface ToolStep {
  id: string;
  type: 'tool';
  use: string;
  with?: Record<string, unknown>;
  onFail?: OnFailValue;
}
export interface LlmStep {
  id: string;
  type: 'llm';
  provider?: string;
  model?: string;
  system?: string;
  prompt: string;
  output?: 'text' | 'json';
  schema?: Record<string, unknown>;
  onFail?: OnFailValue;
}
export interface SubagentStep {
  id: string;
  type: 'subagent';
  agent: string;
  input?: unknown;
  loopUntil?: string;
  maxIterations?: number;
  onFail?: OnFailValue;
}
export interface ConditionStep {
  id: string;
  type: 'condition';
  when: string;
  then: Step[];
  else?: Step[];
  onFail?: OnFailValue;
}
export interface LoopStep {
  id: string;
  type: 'loop';
  while: string;
  maxIterations: number;
  do: Step[];
  onFail?: OnFailValue;
}
export type OnFailValue = 'stop' | 'continue' | string;
export type Step = ToolStep | LlmStep | SubagentStep | ConditionStep | LoopStep;

const StepBase = {
  id: z.string().min(1),
  onFail: OnFail,
};

const ToolStepSchema = z.object({
  ...StepBase,
  type: z.literal('tool'),
  use: z.string(),
  with: z.record(z.unknown()).optional(),
});

const LlmStepSchema = z.object({
  ...StepBase,
  type: z.literal('llm'),
  provider: z.string().optional(),
  model: z.string().optional(),
  system: z.string().optional(),
  prompt: z.string(),
  output: z.enum(['text', 'json']).default('text'),
  schema: z.record(z.unknown()).optional(),
});

const SubagentStepSchema = z.object({
  ...StepBase,
  type: z.literal('subagent'),
  agent: z.string(),
  input: z.unknown().optional(),
  loopUntil: z.string().optional(),
  maxIterations: z.number().int().positive().optional(),
});

export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z.union([
    ToolStepSchema,
    LlmStepSchema,
    SubagentStepSchema,
    z.object({
      ...StepBase,
      type: z.literal('condition'),
      when: z.string(),
      then: z.array(StepSchema),
      else: z.array(StepSchema).optional(),
    }),
    z.object({
      ...StepBase,
      type: z.literal('loop'),
      while: z.string(),
      maxIterations: z.number().int().positive(),
      do: z.array(StepSchema),
    }),
  ]),
);

export const HarnessSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, 'name must be kebab-case'),
  version: z.literal(HARNESS_SCHEMA_VERSION),
  description: z.string().optional(),
  inputs: z.array(Input).optional(),
  defaults: Defaults.optional(),
  rules: Rules.optional(),
  steps: z.array(StepSchema).min(1),
});

export type Harness = z.infer<typeof HarnessSchema>;
