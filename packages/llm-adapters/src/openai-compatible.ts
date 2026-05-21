// Speaks the OpenAI-compatible chat completions API. Works with:
//   - Ollama         (default baseUrl http://localhost:11434/v1, no api key)
//   - LM Studio      (default baseUrl http://localhost:1234/v1)
//   - vLLM           (-/v1)
//   - llama.cpp      (--server)
//   - OpenAI         (https://api.openai.com/v1, api key required)
//   - Anthropic-proxy / litellm / etc.

import { LlmProviderError, type ChatRequest, type ChatResponse, type LlmProvider } from './types';

export interface OpenAICompatibleOptions {
  id: string;
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly kind = 'openai-compatible' as const;
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    if (!opts.baseUrl) throw new Error('OpenAICompatibleProvider: baseUrl is required');
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LlmProviderError(
        `openai-compatible chat failed: ${res.status} ${body.slice(0, 200)}`,
        res.status,
        this.id,
      );
    }

    const data = (await res.json()) as ChatCompletionsResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: data.model,
      tokens:
        data.usage?.prompt_tokens !== undefined && data.usage?.completion_tokens !== undefined
          ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
          : undefined,
    };
  }
}
