import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Minimum env required so that NextAuth boots in the spawned web server.
// These are intentionally fake; real OAuth flows are not exercised in this PR.
const webEnv = {
  PORT: String(PORT),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret-for-e2e-runs-only-not-a-real-secret',
  AUTH_GITHUB_ID: 'test-client-id',
  AUTH_GITHUB_SECRET: 'test-client-secret',
  OWNER_GITHUB_LOGINS: 'test-user',
  // Internal upsert is not reached by these tests, but the env must be present.
  INTERNAL_API_SECRET: 'test-internal-secret',
  API_INTERNAL_URL: 'http://localhost:65535',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
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
