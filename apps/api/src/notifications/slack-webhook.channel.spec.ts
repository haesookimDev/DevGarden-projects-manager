import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SlackWebhookChannel } from './slack-webhook.channel';

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

// Spin a local HTTP server that runs `handler` per request and returns its URL.
async function listen(
  handler: (reqBody: string, requestIndex: number) => { status: number },
): Promise<string> {
  let count = 0;
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const { status } = handler(Buffer.concat(chunks).toString('utf8'), count++);
      res.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const addr = server!.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${addr.port}/hook`;
}

describe('SlackWebhookChannel', () => {
  it('posts the message and resolves true on 200', async () => {
    let received: string | undefined;
    const url = await listen((body) => {
      received = body;
      return { status: 200 };
    });

    const ok = await new SlackWebhookChannel().send(url, { text: 'hello' });

    expect(ok).toBe(true);
    expect(JSON.parse(received!)).toEqual({ text: 'hello' });
  });

  it('retries on a 500 and succeeds on a later attempt', async () => {
    let requests = 0;
    const url = await listen((_body, i) => {
      requests = i + 1;
      return { status: i < 2 ? 500 : 200 };
    });

    const ok = await new SlackWebhookChannel().send(url, { text: 'retry me' });

    expect(ok).toBe(true);
    expect(requests).toBe(3);
  });

  it('returns false after exhausting retries', async () => {
    let requests = 0;
    const url = await listen((_body, i) => {
      requests = i + 1;
      return { status: 500 };
    });

    const ok = await new SlackWebhookChannel().send(url, { text: 'nope' });

    expect(ok).toBe(false);
    expect(requests).toBe(3);
  });
});
