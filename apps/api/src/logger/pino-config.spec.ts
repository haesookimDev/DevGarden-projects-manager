import { describe, expect, it } from 'vitest';
import { buildPinoParams } from './pino-config';

describe('buildPinoParams', () => {
  it('uses pino-pretty transport in dev', () => {
    const params = buildPinoParams({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(params.pinoHttp).toBeDefined();
    const cfg = params.pinoHttp as { transport?: { target: string }; level: string };
    expect(cfg.transport?.target).toBe('pino-pretty');
    expect(cfg.level).toBe('debug');
  });

  it('omits transport in prod for JSON output', () => {
    const params = buildPinoParams({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    const cfg = params.pinoHttp as { transport?: unknown; level: string };
    expect(cfg.transport).toBeUndefined();
    expect(cfg.level).toBe('info');
  });

  it('respects LOG_LEVEL override', () => {
    const params = buildPinoParams({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
    } as NodeJS.ProcessEnv);
    const cfg = params.pinoHttp as { level: string };
    expect(cfg.level).toBe('warn');
  });
});
