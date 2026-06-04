// Tokens for the two ioredis connections the rest of the api injects.
// Two clients because Redis' pub/sub mode puts a connection in a subscriber
// state that can't be used for normal commands — publisher needs its own
// connection. Both are nullable when REDIS_URL is unset (in-process fallback).

import type { Redis } from 'ioredis';

export const REDIS_PUBLISHER = Symbol('REDIS_PUBLISHER');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');

export type RedisClient = Redis | null;
