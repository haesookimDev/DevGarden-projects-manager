// Single source of truth for the REDIS_URL env read. Centralised so both the
// publisher factory and the subscriber factory agree on what "configured"
// means, and so unit specs can flip it without duplicating string parsing.

export function getRedisUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.REDIS_URL?.trim();
  if (!url) return undefined;
  return url;
}
