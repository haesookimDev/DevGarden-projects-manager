export { HARNESS_SCHEMA_VERSION, HarnessSchema, StepSchema } from './schema';
export type {
  Harness,
  Step,
  ToolStep,
  LlmStep,
  SubagentStep,
  ConditionStep,
  LoopStep,
  OnFailValue,
} from './schema';

export { parseHarness, parseHarnessRaw, HarnessParseError } from './parser';

export { evalExpression, interpolate, ExprError, type ExprContext } from './expr';

export { runHarness, RunnerError } from './runner';
export type {
  ToolHandler,
  ToolRunContext,
  HostBridge,
  LlmDispatch,
  SubagentDispatch,
  RunLogEvent,
  StepResult,
  RunResult,
  RunHooks,
  RunOptions,
} from './runner-types';
