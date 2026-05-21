// Drives the `codex` CLI as a subprocess: writes a serialized chat request
// to stdin, parses a structured JSON line from stdout. We intentionally talk
// to codex via a thin JSON envelope so the harness runner does not have to
// care which version of codex is installed.
//
// Wire format (request, single JSON line on stdin):
//   { "model": "...", "messages": [...] }
// Wire format (response, single JSON line on stdout):
//   { "text": "...", "tokens": { "input": 0, "output": 0 } }
//
// Real `codex` invocations may not yet speak this envelope; the harness
// runner will ship a small shim once we settle on the actual codex CLI surface.

import {
  spawn as defaultSpawn,
  type ChildProcessByStdio,
  type SpawnOptionsWithStdioTuple,
  type StdioPipe,
} from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  LlmProviderError,
  type ChatRequest,
  type ChatResponse,
  type LlmProvider,
  type TokenUsage,
} from './types';

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>,
) => ChildProcessByStdio<Writable, Readable, Readable>;

export interface CodexCliOptions {
  id: string;
  command?: string;
  args?: readonly string[];
  spawnImpl?: SpawnFn;
  timeoutMs?: number;
}

interface CodexResponse {
  text?: string;
  tokens?: TokenUsage;
}

export class CodexCliProvider implements LlmProvider {
  readonly kind = 'codex-cli' as const;
  readonly id: string;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly spawnImpl: SpawnFn;
  private readonly timeoutMs: number;

  constructor(opts: CodexCliOptions) {
    this.id = opts.id;
    this.command = opts.command ?? 'codex';
    this.args = opts.args ?? ['chat', '--format', 'json'];
    this.spawnImpl = opts.spawnImpl ?? (defaultSpawn as unknown as SpawnFn);
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const child = this.spawnImpl(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    const payload = JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
    });
    child.stdin.end(`${payload}\n`);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new LlmProviderError(`codex-cli timed out after ${this.timeoutMs}ms`, undefined, this.id),
        );
      }, this.timeoutMs);
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new LlmProviderError(`codex-cli spawn failed: ${err.message}`, undefined, this.id));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(0, 200);
      throw new LlmProviderError(`codex-cli exited ${exitCode}: ${stderr}`, undefined, this.id);
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
    let parsed: CodexResponse;
    try {
      parsed = JSON.parse(stdout) as CodexResponse;
    } catch (e) {
      throw new LlmProviderError(
        `codex-cli emitted non-JSON: ${(e as Error).message}`,
        undefined,
        this.id,
      );
    }

    return {
      text: parsed.text ?? '',
      tokens: parsed.tokens,
    };
  }
}
