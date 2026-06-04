import { describe, expect, it } from 'vitest';
import { getRedisUrl } from './redis.config';

describe('getRedisUrl', () => {
  it('returns undefined when REDIS_URL is unset', () => {
    expect(getRedisUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('returns undefined when REDIS_URL is blank or whitespace', () => {
    expect(getRedisUrl({ REDIS_URL: '' } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(getRedisUrl({ REDIS_URL: '   ' } as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('returns the configured url trimmed', () => {
    expect(getRedisUrl({ REDIS_URL: '  redis://localhost:6379  ' } as NodeJS.ProcessEnv)).toBe(
      'redis://localhost:6379',
    );
  });
});
