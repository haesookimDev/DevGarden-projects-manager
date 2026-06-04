// Socket.io adapter that fans-out emits across api instances via Redis.
// When REDIS_URL is unset the in-memory adapter (socket.io default) is used,
// preserving the v0.2 single-instance behavior.
//
// We own a dedicated pair of ioredis connections here rather than reusing
// REDIS_PUBLISHER / REDIS_SUBSCRIBER from RedisModule because socket.io's
// adapter subscribes to its own internal channels via the sub connection,
// and entangling that with NotificationService's channel routing is fragile.

import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { getRedisUrl } from '../redis/redis.config';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: Redis;
  private subClient?: Redis;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
    const url = getRedisUrl();
    if (!url) return;
    this.pubClient = new Redis(url);
    this.subClient = new Redis(url);
    this.pubClient.on('error', (e) => this.logger.warn(`io-adapter pub error: ${e.message}`));
    this.subClient.on('error', (e) => this.logger.warn(`io-adapter sub error: ${e.message}`));
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log('socket.io redis adapter enabled');
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = super.createIOServer(port, options) as any;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async dispose(): Promise<void> {
    await Promise.all(
      [this.pubClient, this.subClient].map(async (c) => {
        if (!c) return;
        try {
          await c.quit();
        } catch (err) {
          this.logger.warn(`io-adapter redis quit failed: ${(err as Error).message}`);
        }
      }),
    );
  }
}
