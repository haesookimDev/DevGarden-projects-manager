// github.* tools that round-trip through the api over the existing socket
// connection. The api side does the actual GitHub App work — the client never
// holds the App private key.

import type { ToolHandler } from '@devgarden/harness-core';

export function makeGithubTools(): ToolHandler[] {
  return [
    {
      name: 'github.openPR',
      async run(input, ctx) {
        if (!ctx.host) {
          throw new Error('github.openPR requires a host bridge (socket is not available)');
        }
        const projectId = requireString(input, 'projectId');
        const head = requireString(input, 'head');
        const title = requireString(input, 'title');
        const base = typeof input.base === 'string' ? input.base : undefined;
        const body = typeof input.body === 'string' ? input.body : undefined;
        const draft = typeof input.draft === 'boolean' ? input.draft : undefined;

        const ack = await ctx.host.request<
          { ok: true; url: string; number: number } | { ok: false; error: string }
        >('github:openPR', { projectId, head, base, title, body, draft });

        if (!ack.ok) throw new Error(`github.openPR failed: ${ack.error}`);
        return { url: ack.url, number: ack.number };
      },
    },
  ];
}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || !v) {
    throw new Error(`github tool: "${key}" must be a non-empty string`);
  }
  return v;
}
