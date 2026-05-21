import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody needed for GitHub webhook HMAC verification — express buffers it
  // on `req.rawBody` and JSON parsing still runs on top.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.warn(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
