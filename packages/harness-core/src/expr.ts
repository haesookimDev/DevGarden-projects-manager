// Tiny, safe expression evaluator for harness templates.
// Supports:
//   - path lookup:        inputs.x, steps.foo.output, run.id
//   - comparison:         == != < <= > >=
//   - boolean ops:        && ||
//   - logical not:        !x
//   - literals:           numbers, true, false, null, 'strings', "strings"
//
// Deliberately NOT supported: function calls, arithmetic, member assignment,
// arbitrary JS. Anything outside the above grammar throws.

export interface ExprContext {
  [key: string]: unknown;
}

export function evalExpression(expr: string, ctx: ExprContext): unknown {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  const value = parser.parseExpr();
  parser.expectEof();
  return evaluate(value, ctx);
}

/**
 * Replace `${ expression }` occurrences inside a string template.
 * If the template is exactly one expression, returns the raw evaluated value
 * (e.g. a number / boolean / object), preserving type. Otherwise returns a string.
 */
export function interpolate(template: string, ctx: ExprContext): unknown {
  const re = /\$\{\s*([^}]+?)\s*\}/g;

  // Whole-template expression → preserve type.
  const trimmed = template.trim();
  const single = trimmed.match(/^\$\{\s*([^}]+?)\s*\}$/);
  if (single) {
    return evalExpression(single[1]!, ctx);
  }

  return template.replace(re, (_match, expr: string) => {
    const value = evalExpression(expr, ctx);
    return value === null || value === undefined ? '' : String(value);
  });
}

// --- internals -------------------------------------------------------------

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'punct'; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    // strings
    if (c === '"' || c === "'") {
      const quote = c;
      let end = i + 1;
      while (end < src.length && src[end] !== quote) end++;
      if (end >= src.length) throw new ExprError(`unterminated string at ${i}`);
      tokens.push({ kind: 'string', value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    // numbers
    if (/[0-9]/.test(c)) {
      let end = i + 1;
      while (end < src.length && /[0-9.]/.test(src[end]!)) end++;
      tokens.push({ kind: 'number', value: Number(src.slice(i, end)) });
      i = end;
      continue;
    }
    // identifiers / keywords
    if (/[A-Za-z_$]/.test(c)) {
      let end = i + 1;
      while (end < src.length && /[A-Za-z0-9_$.]/.test(src[end]!)) end++;
      const text = src.slice(i, end);
      if (text === 'true' || text === 'false')
        tokens.push({ kind: 'bool', value: text === 'true' });
      else if (text === 'null') tokens.push({ kind: 'null' });
      else tokens.push({ kind: 'ident', value: text });
      i = end;
      continue;
    }
    // multi-char punct
    if ('=!<>&|'.includes(c)) {
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        tokens.push({ kind: 'punct', value: two });
        i += 2;
        continue;
      }
    }
    if (c === '!' || c === '<' || c === '>' || c === '(' || c === ')') {
      tokens.push({ kind: 'punct', value: c });
      i++;
      continue;
    }
    throw new ExprError(`unexpected character "${c}" at ${i}`);
  }
  return tokens;
}

type Node =
  | { kind: 'lit'; value: unknown }
  | { kind: 'path'; value: string }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'unop'; op: string; operand: Node };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parseExpr(): Node {
    return this.parseOr();
  }

  expectEof(): void {
    if (this.pos !== this.tokens.length) {
      throw new ExprError(`unexpected trailing token`);
    }
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.match('||')) left = { kind: 'binop', op: '||', left, right: this.parseAnd() };
    return left;
  }
  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.match('&&')) left = { kind: 'binop', op: '&&', left, right: this.parseEquality() };
    return left;
  }
  private parseEquality(): Node {
    let left = this.parseComparison();
    while (this.matchAny('==', '!=')) {
      const prev = this.previous();
      const op = prev.kind === 'punct' ? prev.value : '';
      left = { kind: 'binop', op, left, right: this.parseComparison() };
    }
    return left;
  }
  private parseComparison(): Node {
    let left = this.parseUnary();
    while (this.matchAny('<', '<=', '>', '>=')) {
      const prev = this.previous();
      const op = prev.kind === 'punct' ? prev.value : '';
      left = { kind: 'binop', op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Node {
    if (this.match('!')) return { kind: 'unop', op: '!', operand: this.parseUnary() };
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    if (this.match('(')) {
      const inner = this.parseExpr();
      if (!this.match(')')) throw new ExprError('missing )');
      return inner;
    }
    const t = this.advance();
    if (!t) throw new ExprError('unexpected end of expression');
    switch (t.kind) {
      case 'number':
      case 'string':
      case 'bool':
        return { kind: 'lit', value: t.value };
      case 'null':
        return { kind: 'lit', value: null };
      case 'ident':
        return { kind: 'path', value: t.value };
      case 'punct':
        throw new ExprError(`unexpected token "${t.value}"`);
    }
  }

  private match(value: string): boolean {
    const t = this.tokens[this.pos];
    if (t?.kind === 'punct' && t.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }
  private matchAny(...values: string[]): boolean {
    return values.some((v) => this.match(v));
  }
  private advance(): Token | undefined {
    return this.tokens[this.pos++];
  }
  private previous(): Token {
    const t = this.tokens[this.pos - 1];
    if (!t) throw new ExprError('no previous token');
    return t;
  }
}

function evaluate(node: Node, ctx: ExprContext): unknown {
  switch (node.kind) {
    case 'lit':
      return node.value;
    case 'path':
      return lookup(node.value, ctx);
    case 'unop': {
      const v = evaluate(node.operand, ctx);
      if (node.op === '!') return !truthy(v);
      throw new ExprError(`unsupported unop ${node.op}`);
    }
    case 'binop': {
      // Short-circuit before evaluating the right side for boolean ops.
      if (node.op === '&&') {
        const l = evaluate(node.left, ctx);
        if (!truthy(l)) return l;
        return evaluate(node.right, ctx);
      }
      if (node.op === '||') {
        const l = evaluate(node.left, ctx);
        if (truthy(l)) return l;
        return evaluate(node.right, ctx);
      }
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      switch (node.op) {
        case '==':
          return l === r;
        case '!=':
          return l !== r;
        case '<':
          return compare(l, r) < 0;
        case '<=':
          return compare(l, r) <= 0;
        case '>':
          return compare(l, r) > 0;
        case '>=':
          return compare(l, r) >= 0;
      }
      throw new ExprError(`unsupported binop ${node.op}`);
    }
  }
}

function lookup(path: string, ctx: ExprContext): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function truthy(v: unknown): boolean {
  return !!v;
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExprError';
  }
}
