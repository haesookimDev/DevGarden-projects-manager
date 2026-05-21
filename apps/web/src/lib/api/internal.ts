// Shared helper for server-only calls to the api's /internal/* routes.

export function getInternalApiConfig(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.API_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!baseUrl || !secret) {
    throw new Error('API_INTERNAL_URL or INTERNAL_API_SECRET is not configured for the web server');
  }
  return { baseUrl, secret };
}

export async function internalFetch(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<Response> {
  const { baseUrl, secret } = getInternalApiConfig();

  const headers: Record<string, string> = {
    'x-internal-secret': secret,
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  return fetch(`${baseUrl}${path}`, { method: init.method, headers, body });
}
