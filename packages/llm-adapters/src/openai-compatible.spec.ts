import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';
import { LlmProviderError } from './types';

function mockOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAICompatibleProvider', () => {
  it('posts the chat request and returns the assistant text + token usage', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOkResponse({
        model: 'qwen2.5:14b',
        choices: [{ message: { content: 'hi there' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    const provider = new OpenAICompatibleProvider({
      id: 'ollama-local',
      baseUrl: 'http://localhost:11434/v1',
      fetchImpl: fetchFn,
    });

    const res = await provider.chat({
      model: 'qwen2.5:14b',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(res.text).toBe('hi there');
    expect(res.tokens).toEqual({ input: 10, output: 5 });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'qwen2.5:14b',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
  });

  it('attaches Bearer Authorization header when an api key is provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOkResponse({ choices: [] }));
    const provider = new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetchImpl: fetchFn,
    });
    await provider.chat({ model: 'gpt-4', messages: [] });
    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.headers.authorization).toBe('Bearer sk-test');
  });

  it('throws LlmProviderError with status on non-2xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const provider = new OpenAICompatibleProvider({
      id: 'p',
      baseUrl: 'http://x',
      fetchImpl: fetchFn,
    });
    try {
      await provider.chat({ model: 'm', messages: [] });
      expect.fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LlmProviderError);
      expect((e as LlmProviderError).status).toBe(503);
    }
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOkResponse({ choices: [] }));
    const provider = new OpenAICompatibleProvider({
      id: 'p',
      baseUrl: 'http://x/',
      fetchImpl: fetchFn,
    });
    await provider.chat({ model: 'm', messages: [] });
    expect(fetchFn.mock.calls[0]![0]).toBe('http://x/chat/completions');
  });

  it('returns empty text when the upstream omits content', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOkResponse({ choices: [{}] }));
    const provider = new OpenAICompatibleProvider({
      id: 'p',
      baseUrl: 'http://x',
      fetchImpl: fetchFn,
    });
    const res = await provider.chat({ model: 'm', messages: [] });
    expect(res.text).toBe('');
    expect(res.tokens).toBeUndefined();
  });
});
