import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.warn(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
