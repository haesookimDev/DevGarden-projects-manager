import { defineConfig, devices } from '@playwright/test';
import { MOCK_PORT } from './e2e/global-setup';

const PORT = Number(process.env.PORT) || 3100;
const BASE_URL = `http://localhost:${PORT}`;
const MOCK_BASE = `http://localhost:${MOCK_PORT}`;

// Env injected into the spawned `pnpm dev` so the NextAuth GitHub provider
// + the upsertUserViaApi helper both point at the in-process mock server.
const webEnv = {
  PORT: String(PORT),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret-for-e2e-runs-only-not-a-real-secret',
  AUTH_GITHUB_ID: 'test-client-id',
  AUTH_GITHUB_SECRET: 'test-client-secret',
  AUTH_GITHUB_AUTHORIZATION_URL: `${MOCK_BASE}/login/oauth/authorize`,
  AUTH_GITHUB_TOKEN_URL: `${MOCK_BASE}/login/oauth/access_token`,
  AUTH_GITHUB_USERINFO_URL: `${MOCK_BASE}/user`,
  OWNER_GITHUB_LOGINS: 'test-user',
  INTERNAL_API_SECRET: 'test-internal-secret',
  API_INTERNAL_URL: MOCK_BASE,
};

export default defineConfig({
  testDir: './e2e',
  // OAuth flow uses shared mock state; serialize tests to keep them independent.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webEnv,
  },
});
