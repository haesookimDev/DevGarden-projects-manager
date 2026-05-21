// Server-side helper called from NextAuth signIn callback.
// Posts an upserted user to the API using the shared INTERNAL_API_SECRET.

export interface UpsertUserInput {
  githubId: number;
  login: string;
  email?: string | null;
}

export interface UpsertedUser {
  id: string;
  githubId: number;
  login: string;
  role: string;
}

export async function upsertUserViaApi(input: UpsertUserInput): Promise<UpsertedUser> {
  const apiBase = process.env.API_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!apiBase || !secret) {
    throw new Error('API_INTERNAL_URL or INTERNAL_API_SECRET is not configured for the web server');
  }

  const res = await fetch(`${apiBase}/internal/users/upsert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upsertUserViaApi failed: ${res.status} ${text}`);
  }

  return (await res.json()) as UpsertedUser;
}
