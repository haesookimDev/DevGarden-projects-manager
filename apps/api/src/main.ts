import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io-adapter';

async function bootstrap() {
  // rawBody needed for GitHub webhook HMAC verification — express buffers it
  // on `req.rawBody` and JSON parsing still runs on top.
  // bufferLogs lets the pino logger take over before any application code logs.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Surfaces SIGTERM/SIGINT to Nest's onApplicationShutdown so RedisModule
  // (and any future infra modules) can quit() their clients before exit.
  app.enableShutdownHooks();
  // Multi-instance socket.io fan-out (P1-3). No-op when REDIS_URL is unset.
  app.useWebSocketAdapter(new RedisIoAdapter(app));

  // CORS: the Tauri desktop client's webview calls /clients/pair directly
  // from origin `tauri://localhost` (or `https://tauri.localhost` on Windows).
  // Web → api is server-to-server (BFF) so it doesn't go through CORS. We
  // optionally allow extra origins via `CORS_ALLOW_ORIGINS` (comma-separated)
  // for ops that need to script against the api from a different host.
  const allowed = parseAllowedOrigins(process.env.CORS_ALLOW_ORIGINS);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser callers (no Origin header).
      if (!origin) return callback(null, true);
      if (allowed.has('*')) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      // Tauri webview origins on each platform.
      if (origin === 'tauri://localhost') return callback(null, true);
      if (origin === 'https://tauri.localhost') return callback(null, true);
      return callback(new Error(`CORS: origin "${origin}" not allowed`), false);
    },
    credentials: false,
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log({ port }, `[api] listening on http://localhost:${port}`);
  warnIfLegacyGithubEnv(logger);
}

function warnIfLegacyGithubEnv(logger: Logger): void {
  const set = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET'].filter(
    (k) => typeof process.env[k] === 'string' && process.env[k] !== '',
  );
  if (set.length === 0) return;
  // One-time WARN at boot to nudge existing self-hosters onto the new
  // /dashboard/onboarding flow added in v0.2 N1. The env path stays alive
  // for at least one more minor; this message is purely advisory.
  logger.warn(
    { deprecatedEnv: set },
    `DEPRECATED: ${set.join(', ')} env var(s) set. ` +
      `v0.2 introduces the /dashboard/onboarding flow (manifest or BYO) which ` +
      `stores App credentials envelope-encrypted in the DB. The env-driven path ` +
      `still works in this release but will be removed in a future minor. ` +
      `Migrate via /dashboard/onboarding when convenient.`,
  );
}

function parseAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

void bootstrap();
