import { describe, expect, it } from 'vitest';
import { HarnessParseError, parseHarness } from './parser';

const validYaml = `
name: fix-issue
version: 1
inputs:
  - { name: issueNumber, type: number, required: true }
steps:
  - id: read
    type: tool
    use: github.getIssue
    with: { number: 1 }
  - id: plan
    type: llm
    prompt: |
      hello
  - id: gate
    type: condition
    when: 'steps.plan.output == "go"'
    then:
      - id: act
        type: tool
        use: git.commit
  - id: retry-block
    type: loop
    while: 'steps.act.exitCode != 0'
    maxIterations: 3
    do:
      - id: retry-act
        type: tool
        use: git.commit
`;

describe('parseHarness — happy path', () => {
  it('parses a full harness with nested steps', () => {
    const harness = parseHarness(validYaml);
    expect(harness.name).toBe('fix-issue');
    expect(harness.version).toBe(1);
    expect(harness.steps).toHaveLength(4);
    expect(harness.steps[0]!.type).toBe('tool');
    expect(harness.steps[2]!.type).toBe('condition');
    expect(harness.steps[3]!.type).toBe('loop');
  });

  it('fills onFail default to "stop"', () => {
    const h = parseHarness(validYaml);
    expect(h.steps[0]!.onFail).toBe('stop');
  });
});

describe('parseHarness — validation errors', () => {
  it('rejects YAML parse errors', () => {
    expect(() => parseHarness('::: not yaml')).toThrow(HarnessParseError);
  });

  it('rejects missing required fields', () => {
    expect(() => parseHarness('name: x\nversion: 1\nsteps: []')).toThrow(HarnessParseError);
  });

  it('rejects non-kebab-case names', () => {
    const bad = validYaml.replace('name: fix-issue', 'name: FixIssue');
    expect(() => parseHarness(bad)).toThrow(HarnessParseError);
  });

  it('rejects an unknown step kind', () => {
    const bad = `
name: x
version: 1
steps:
  - id: a
    type: nope
`;
    expect(() => parseHarness(bad)).toThrow(HarnessParseError);
  });

  it('rejects duplicate step ids across nesting', () => {
    const bad = `
name: x
version: 1
steps:
  - id: dup
    type: tool
    use: github.getIssue
  - id: outer
    type: condition
    when: 'true'
    then:
      - id: dup
        type: tool
        use: git.commit
`;
    expect(() => parseHarness(bad)).toThrow(/duplicate step id: dup/);
  });

  it('rejects loop without maxIterations', () => {
    const bad = `
name: x
version: 1
steps:
  - id: l
    type: loop
    while: 'true'
    do:
      - id: inner
        type: tool
        use: x
`;
    expect(() => parseHarness(bad)).toThrow(HarnessParseError);
  });
});
