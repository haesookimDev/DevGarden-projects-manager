import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Redis } from 'ioredis';
import { getRedisUrl } from './redis.config';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER, type RedisClient } from './redis.tokens';

// Two factory providers — one publisher, one subscriber. Both return null
// when REDIS_URL is unset so single-instance self-hosters need no Redis at
// all. ApplicationShutdown closes whatever connections we opened.
//
// @Global so other modules can inject the tokens without importing
// RedisModule themselves (matches the "ambient infra" feel of pubsub).
@Global()
@Module({
  providers: [
    {
      provide: REDIS_PUBLISHER,
      useFactory: (): RedisClient => buildClient('publisher'),
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (): RedisClient => buildClient('subscriber'),
    },
  ],
  exports: [REDIS_PUBLISHER, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const pub = this.moduleRef.get<RedisClient>(REDIS_PUBLISHER, { strict: false });
    const sub = this.moduleRef.get<RedisClient>(REDIS_SUBSCRIBER, { strict: false });
    await Promise.all(
      [pub, sub].map(async (c) => {
        if (!c) return;
        try {
          await c.quit();
        } catch (err) {
          this.logger.warn(`redis quit failed: ${(err as Error).message}`);
        }
      }),
    );
  }
}

function buildClient(role: 'publisher' | 'subscriber'): RedisClient {
  const url = getRedisUrl();
  if (!url) return null;
  const client = new Redis(url, {
    // Don't spam stderr if Redis is briefly unreachable — log once via the
    // ioredis listener instead. Default retry/reconnect behavior preserved.
    enableOfflineQueue: role === 'publisher',
    maxRetriesPerRequest: role === 'publisher' ? 3 : null,
    lazyConnect: false,
  });
  const log = new Logger(`Redis:${role}`);
  client.on('error', (err) => log.warn(`redis ${role} error: ${err.message}`));
  client.on('connect', () => log.log(`redis ${role} connected`));
  return client;
}
