import type { Params } from 'nestjs-pino';

// Centralised pino config so the LoggerModule registration and any unit
// test that wants to assert formatter selection share one source of truth.
//
// dev (NODE_ENV !== 'production'): pino-pretty for human reading
// prod (NODE_ENV === 'production'): JSON one-line for log shippers
export function buildPinoParams(env: NodeJS.ProcessEnv = process.env): Params {
  const isProd = env.NODE_ENV === 'production';
  const level = env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');
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
