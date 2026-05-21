import { describe, expect, it } from 'vitest';
import { evalExpression, ExprError, interpolate } from './expr';

const ctx = {
  inputs: { issueNumber: 42, enabled: true, name: 'alice' },
  steps: {
    plan: { output: 'go', tokens: 1234 },
    tests: { exitCode: 0 },
  },
  run: { id: 'run-1' },
};

describe('evalExpression — literals + paths', () => {
  it('parses numbers, strings, booleans, null', () => {
    expect(evalExpression('1', ctx)).toBe(1);
    expect(evalExpression("'hi'", ctx)).toBe('hi');
    expect(evalExpression('"hi"', ctx)).toBe('hi');
    expect(evalExpression('true', ctx)).toBe(true);
    expect(evalExpression('false', ctx)).toBe(false);
    expect(evalExpression('null', ctx)).toBeNull();
  });

  it('resolves dotted paths', () => {
    expect(evalExpression('inputs.issueNumber', ctx)).toBe(42);
    expect(evalExpression('steps.plan.output', ctx)).toBe('go');
    expect(evalExpression('run.id', ctx)).toBe('run-1');
  });

  it('returns undefined for missing paths', () => {
    expect(evalExpression('steps.unknown.output', ctx)).toBeUndefined();
  });
});

describe('evalExpression — operators', () => {
  it('compares with == and !=', () => {
    expect(evalExpression('inputs.issueNumber == 42', ctx)).toBe(true);
    expect(evalExpression('inputs.name != "bob"', ctx)).toBe(true);
  });
  it('compares with </<=/>/>=', () => {
    expect(evalExpression('steps.plan.tokens > 1000', ctx)).toBe(true);
    expect(evalExpression('steps.tests.exitCode <= 0', ctx)).toBe(true);
  });
  it('boolean ops short-circuit', () => {
    expect(evalExpression('inputs.enabled && steps.tests.exitCode == 0', ctx)).toBe(true);
    expect(evalExpression('false || inputs.name == "alice"', ctx)).toBe(true);
    expect(evalExpression('!inputs.enabled', ctx)).toBe(false);
  });
  it('respects parentheses', () => {
    expect(evalExpression('(1 < 2) && (3 > 2)', ctx)).toBe(true);
  });
});

describe('evalExpression — errors', () => {
  it('rejects unsupported syntax (function calls)', () => {
    expect(() => evalExpression('foo()', ctx)).toThrow(ExprError);
  });
  it('rejects arithmetic', () => {
    expect(() => evalExpression('1 + 2', ctx)).toThrow(ExprError);
  });
  it('rejects unterminated strings', () => {
    expect(() => evalExpression("'oops", ctx)).toThrow(ExprError);
  });
  it('rejects trailing tokens', () => {
    expect(() => evalExpression('1 2', ctx)).toThrow(ExprError);
  });
});

describe('interpolate', () => {
  it('substitutes ${...} occurrences', () => {
    expect(interpolate('issue #${inputs.issueNumber}', ctx)).toBe('issue #42');
  });

  it('preserves type when the template is exactly one expression', () => {
    expect(interpolate('${inputs.issueNumber}', ctx)).toBe(42);
    expect(interpolate('${inputs.enabled}', ctx)).toBe(true);
  });

  it('renders undefined / null as empty string in mixed templates', () => {
    expect(interpolate('value=[${steps.unknown.output}]', ctx)).toBe('value=[]');
  });
});
