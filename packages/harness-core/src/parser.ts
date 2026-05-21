import { parse as parseYaml } from 'yaml';
import { HarnessSchema, type Harness } from './schema';

export class HarnessParseError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'HarnessParseError';
  }
}

/**
 * Parse a YAML harness definition into a validated IR.
 * Throws HarnessParseError on YAML / schema errors.
 */
export function parseHarness(yaml: string): Harness {
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'invalid YAML';
    throw new HarnessParseError(`yaml parse failed: ${message}`);
  }
  return parseHarnessRaw(raw);
}

export function parseHarnessRaw(raw: unknown): Harness {
  const result = HarnessSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues;
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new HarnessParseError(`harness schema invalid: ${summary}`, issues);
  }
  assertStepIdsUnique(result.data);
  return result.data;
}

function assertStepIdsUnique(harness: Harness): void {
  const seen = new Set<string>();
  const visit = (steps: typeof harness.steps): void => {
    for (const step of steps) {
      if (seen.has(step.id)) {
        throw new HarnessParseError(`duplicate step id: ${step.id}`);
      }
      seen.add(step.id);
      if (step.type === 'condition') {
        visit(step.then);
        if (step.else) visit(step.else);
      } else if (step.type === 'loop') {
        visit(step.do);
      }
    }
  };
  visit(harness.steps);
}
