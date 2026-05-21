// Provider-agnostic LLM types. Harness runner consumes these; concrete
// providers (openai-compatible, codex-cli, ...) implement LlmProvider.

export type LlmProviderKind = 'codex-cli' | 'openai-compatible';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface ChatResponse {
  text: string;
  tokens?: TokenUsage;
  model?: string;
}

export interface LlmProvider {
  readonly kind: LlmProviderKind;
  readonly id: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly providerId?: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
