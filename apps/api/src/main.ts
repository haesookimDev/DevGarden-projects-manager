import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody needed for GitHub webhook HMAC verification — express buffers it
  // on `req.rawBody` and JSON parsing still runs on top.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
  console.warn(`[api] listening on http://localhost:${port}`);
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
