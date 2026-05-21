import { startMockServer, type MockServerHandle } from './mock-server';

// Playwright globalSetup. Boots the mock GitHub + api server BEFORE the web
// server starts so that NextAuth env (AUTH_GITHUB_*_URL, API_INTERNAL_URL)
// can point at it.

const MOCK_PORT = 5566;

let handle: MockServerHandle | undefined;

export default async function globalSetup() {
  handle = await startMockServer(MOCK_PORT);
  // Store handle for teardown via globalThis (Playwright re-imports module).
  (globalThis as unknown as { __mockServer?: MockServerHandle }).__mockServer = handle;
}

export async function teardown() {
  const h = (globalThis as unknown as { __mockServer?: MockServerHandle }).__mockServer;
  if (h) await h.close();
}

export { MOCK_PORT };
