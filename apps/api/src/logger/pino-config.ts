import type { Params } from 'nestjs-pino';

// Centralised pino config so the LoggerModule registration and any unit
// test that wants to assert formatter selection share one source of truth.
//
// dev (NODE_ENV !== 'production'): pino-pretty for human reading
// prod (NODE_ENV === 'production'): JSON one-line for log shippers
export function buildPinoParams(env: NodeJS.ProcessEnv = process.env): Params {
  const isProd = env.NODE_ENV === 'production';
  // `${LOG_LEVEL:-}` in docker compose exports an empty string when the var
  // is unset, and pino throws `default level: must be included in custom
  // levels` on `''`. Treat empty / whitespace as unset.
  const trimmed = env.LOG_LEVEL?.trim();
  const level = trimmed ? trimmed : isProd ? 'info' : 'debug';
  return {
    pinoHttp: {
      level,
      // Disable automatic req/res logging for healthchecks — they're noisy
      // and the response code is already in /healthz output.
      autoLogging: {
        ignore: (req) => req.url === '/healthz' || req.url === '/healthz/ready',
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
            },
          },
    },
  };
}
