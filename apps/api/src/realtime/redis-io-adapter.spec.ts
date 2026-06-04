// Smoke test for the trigger logic in RedisIoAdapter — confirms that when
// REDIS_URL is unset we don't open redis connections (single-instance
// behavior preserved). The full multi-instance broadcast path is exercised
// by the integration spec.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const ioredisMock = vi.fn();

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation((url: string) => {
    ioredisMock(url);
    return { on: vi.fn(), quit: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// Stub the @nestjs/platform-socket.io base to avoid pulling express + socket.io
// initialisation into the unit run.
vi.mock('@nestjs/platform-socket.io', () => ({
  IoAdapter: class {
    constructor(_app: unknown) {}
    createIOServer(_port: number) {
      return { adapter: vi.fn() };
    }
  },
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(() => 'redis-adapter-fn'),
}));

beforeEach(() => {
  ioredisMock.mockReset();
  delete process.env.REDIS_URL;
});

afterEach(() => {
  delete process.env.REDIS_URL;
});

describe('RedisIoAdapter', () => {
  it('does not construct redis clients when REDIS_URL is unset', async () => {
    const { RedisIoAdapter } = await import('./redis-io-adapter');
    new RedisIoAdapter({} as never);
    expect(ioredisMock).not.toHaveBeenCalled();
  });

  it('constructs pub + sub clients when REDIS_URL is set', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.resetModules();
    const { RedisIoAdapter } = await import('./redis-io-adapter');
    new RedisIoAdapter({} as never);
    expect(ioredisMock).toHaveBeenCalledTimes(2);
    expect(ioredisMock).toHaveBeenCalledWith('redis://localhost:6379');
  });
});
