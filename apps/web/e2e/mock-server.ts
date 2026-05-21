// Tiny in-process HTTP server that fakes the GitHub OAuth endpoints AND the
// devgarden api `/internal/users/upsert` endpoint, so a Playwright run can
// exercise the full NextAuth flow without any real network calls.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface MockServerHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

const MOCK_USER = {
  id: 999_001,
  login: 'test-user',
  email: 'test-user@example.com',
  name: 'Test User',
};
const MOCK_DB_USER_ID = 'cuid_test_user';
const MOCK_ACCESS_TOKEN = 'mock-access-token';
const MOCK_CODE = 'mock-auth-code';

export async function startMockServer(port = 0): Promise<MockServerHandle> {
  const server = createServer((req, res) => handle(req, res));
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('mock server has no address');
  const actualPort = address.port;

  return {
    server,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // --- GitHub OAuth mock ---

  if (url.pathname === '/login/oauth/authorize' && req.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state') ?? '';
    if (!redirectUri) {
      res.writeHead(400).end('missing redirect_uri');
      return;
    }
    const target = new URL(redirectUri);
    target.searchParams.set('code', MOCK_CODE);
    target.searchParams.set('state', state);
    res.writeHead(302, { location: target.toString() }).end();
    return;
  }

  if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          access_token: MOCK_ACCESS_TOKEN,
          token_type: 'bearer',
          scope: 'read:user user:email',
        }),
      );
    });
    return;
  }

  if (url.pathname === '/user' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(MOCK_USER));
    return;
  }

  // --- devgarden api mock ---

  if (url.pathname === '/internal/users/upsert' && req.method === 'POST') {
    readBody(req).then((body) => {
      let parsed: { githubId?: number; login?: string } = {};
      try {
        parsed = JSON.parse(body) as { githubId?: number; login?: string };
      } catch {
        // ignore — return defaults
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: MOCK_DB_USER_ID,
          githubId: parsed.githubId ?? MOCK_USER.id,
          login: parsed.login ?? MOCK_USER.login,
          role: 'OWNER',
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/projects' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
    return;
  }

  if (url.pathname === '/internal/clients/pairings' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          token: 'mock-pairing-token-abcdef0123456789',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/clients' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-client-1',
          name: 'Mock Laptop',
          hostname: 'host-1',
          os: 'darwin',
          version: '0.0.0',
          status: 'ONLINE',
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          id: 'mock-client-2',
          name: 'Mock Server',
          hostname: 'host-2',
          os: 'linux',
          version: '0.0.0',
          status: 'OFFLINE',
          lastSeenAt: null,
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ]),
    );
    return;
  }

  res.writeHead(404).end(`mock-server: no route ${req.method} ${url.pathname}`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export const MOCK_VALUES = {
  USER: MOCK_USER,
  DB_USER_ID: MOCK_DB_USER_ID,
  ACCESS_TOKEN: MOCK_ACCESS_TOKEN,
  CODE: MOCK_CODE,
};
