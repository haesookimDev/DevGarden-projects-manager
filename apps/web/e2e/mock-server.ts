// Tiny in-process HTTP server that fakes the GitHub OAuth endpoints AND the
// devgarden api `/internal/users/upsert` endpoint, so a Playwright run can
// exercise the full NextAuth flow without any real network calls.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface MockServerHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

const MOCK_USER = {
  id: 999_001,
  login: 'test-user',
  email: 'test-user@example.com',
  name: 'Test User',
};
const MOCK_DB_USER_ID = 'cuid_test_user';
const MOCK_ACCESS_TOKEN = 'mock-access-token';
const MOCK_CODE = 'mock-auth-code';

// Empty-fixtures toggle. Flipped via POST /mock/set-empty so e2e specs can
// exercise EmptyState rendering without a separate mock-server boot.
// `fullyParallel: false` in playwright.config.ts keeps this safe.
let emptyFixtures = false;

// Onboarding-registered toggle. Off by default: /internal/github/registrations
// 404s and /installations returns []. On: returns a stub registration row and
// one matching installation, so the onboarding screen can be e2e'd in its
// post-registration state.
let onboardingRegistered = false;

export async function startMockServer(port = 0): Promise<MockServerHandle> {
  const server = createServer((req, res) => handle(req, res));
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('mock server has no address');
  const actualPort = address.port;

  return {
    server,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // --- Test control: toggle empty-fixtures mode (e2e-only) ---
  if (url.pathname === '/mock/set-empty' && req.method === 'POST') {
    readBody(req).then((raw) => {
      try {
        const body = JSON.parse(raw || '{}') as { value?: boolean };
        emptyFixtures = Boolean(body.value);
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ emptyFixtures }));
      } catch {
        res.writeHead(400).end('invalid body');
      }
    });
    return;
  }

  if (url.pathname === '/mock/set-onboarding-registered' && req.method === 'POST') {
    readBody(req).then((raw) => {
      try {
        const body = JSON.parse(raw || '{}') as { value?: boolean };
        onboardingRegistered = Boolean(body.value);
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ onboardingRegistered }));
      } catch {
        res.writeHead(400).end('invalid body');
      }
    });
    return;
  }

  // --- N1 GitHub onboarding stubs ---

  if (url.pathname === '/internal/github/registrations' && req.method === 'GET') {
    if (!onboardingRegistered) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"message":"not found"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: 'mock-reg-1',
        ownerId: MOCK_DB_USER_ID,
        source: 'BYO',
        appId: 12345,
        appSlug: 'mock-app',
        clientId: null,
        htmlUrl: 'https://github.com/apps/mock-app',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    return;
  }

  if (url.pathname === '/internal/github/installations' && req.method === 'GET') {
    if (!onboardingRegistered) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-inst-1',
          registrationId: 'mock-reg-1',
          installationId: 9001,
          accountLogin: 'mock-octocat',
          accountType: 'User',
          accountId: 1,
          htmlUrl: 'https://github.com/settings/installations/9001',
          permissions: {
            contents: 'write',
            metadata: 'read',
            pull_requests: 'write',
            issues: 'write',
          },
          events: ['pull_request', 'issues'],
          repositorySelection: 'selected',
          syncedAt: new Date().toISOString(),
        },
      ]),
    );
    return;
  }

  const installationReposMatch = url.pathname.match(
    /^\/internal\/github\/installations\/([^/]+)\/repos$/,
  );
  if (installationReposMatch && req.method === 'GET') {
    if (!onboardingRegistered) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 1,
          name: 'demo-repo',
          fullName: 'mock-octocat/demo-repo',
          private: false,
          fork: false,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/mock-octocat/demo-repo',
        },
        {
          id: 2,
          name: 'internal-tools',
          fullName: 'mock-octocat/internal-tools',
          private: true,
          fork: false,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/mock-octocat/internal-tools',
        },
      ]),
    );
    return;
  }

  // --- GitHub OAuth mock ---

  if (url.pathname === '/login/oauth/authorize' && req.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state') ?? '';
    if (!redirectUri) {
      res.writeHead(400).end('missing redirect_uri');
      return;
    }
    const target = new URL(redirectUri);
    target.searchParams.set('code', MOCK_CODE);
    target.searchParams.set('state', state);
    res.writeHead(302, { location: target.toString() }).end();
    return;
  }

  if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          access_token: MOCK_ACCESS_TOKEN,
          token_type: 'bearer',
          scope: 'read:user user:email',
        }),
      );
    });
    return;
  }

  if (url.pathname === '/user' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(MOCK_USER));
    return;
  }

  // --- devgarden api mock ---

  if (url.pathname === '/internal/users/upsert' && req.method === 'POST') {
    readBody(req).then((body) => {
      let parsed: { githubId?: number; login?: string } = {};
      try {
        parsed = JSON.parse(body) as { githubId?: number; login?: string };
      } catch {
        // ignore — return defaults
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: MOCK_DB_USER_ID,
          githubId: parsed.githubId ?? MOCK_USER.id,
          login: parsed.login ?? MOCK_USER.login,
          role: 'OWNER',
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/projects' && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-project-1',
          repoFullName: 'mock/repo',
          githubInstallationId: 1,
          localRoot: '/tmp/mock',
          createdAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ]),
    );
    return;
  }

  // POST /internal/projects — create. Returns the same project id the rest
  // of the mock seeds so subsequent clone-status / detail navigations work.
  if (url.pathname === '/internal/projects' && req.method === 'POST') {
    readBody(req).then((body) => {
      let parsed: { repoFullName?: string } = {};
      try {
        parsed = JSON.parse(body) as { repoFullName?: string };
      } catch {
        /* ignore — return defaults */
      }
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-project-1',
          repoFullName: parsed.repoFullName ?? 'mock/repo',
          githubRepoId: 42,
        }),
      );
    });
    return;
  }

  // POST /internal/projects/:id/clone — BFF dispatch. Returns 201; the
  // sidecar's reporting back via clone-status webhook is out of scope for
  // the mock and not needed for the e2e (the status page renders the
  // server-rendered snapshot directly).
  const cloneDispatchMatch = url.pathname.match(/^\/internal\/projects\/([^/]+)\/clone$/);
  if (cloneDispatchMatch && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(201, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
    return;
  }

  // PATCH /internal/projects/:id/defaults — echo the patch back as the new
  // defaults shape so the settings page's revalidate + redirect can verify.
  const projectDefaultsMatch = url.pathname.match(/^\/internal\/projects\/([^/]+)\/defaults$/);
  if (projectDefaultsMatch && req.method === 'PATCH') {
    const projectId = projectDefaultsMatch[1]!;
    readBody(req).then((body) => {
      let parsed: {
        defaultHarnessId?: string | null;
        defaultHarnessVersion?: number | null;
        defaultClientId?: string | null;
      } = {};
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        /* ignore */
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: projectId,
          defaultHarnessId: parsed.defaultHarnessId ?? null,
          defaultHarnessVersion: parsed.defaultHarnessVersion ?? null,
          defaultClientId: parsed.defaultClientId ?? null,
        }),
      );
    });
    return;
  }

  const projectMatch = url.pathname.match(/^\/internal\/projects\/([^/]+)$/);
  if (projectMatch && req.method === 'GET') {
    const id = projectMatch[1]!;
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id,
        repoFullName: 'mock/repo',
        githubInstallationId: 1,
        githubRepoId: 42,
        localRoot: '/tmp/mock',
        worktreePolicy: 'AUTO_REMOVE_SUCCESS',
        cloneStatus: 'READY',
        cloneError: null,
        cloneCompletedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        createdAt: new Date(Date.now() - 600_000).toISOString(),
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
        defaultClient: {
          id: 'mock-client-1',
          name: 'Mock Laptop',
          status: 'ONLINE',
        },
        defaultHarness: {
          id: 'mock-harness-1',
          name: 'echo',
          version: 1,
        },
        defaultHarnessVersion: null,
        runCount: 3,
        lastRun: {
          id: 'mock-run-7',
          status: 'SUCCESS',
          startedAt: new Date(Date.now() - 120_000).toISOString(),
          finishedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        lastEvent: {
          id: 'mock-event-1',
          eventType: 'push',
          action: null,
          receivedAt: new Date(Date.now() - 30_000).toISOString(),
        },
      }),
    );
    return;
  }

  // Project-scoped preset list. Empty under emptyFixtures, otherwise returns
  // one default preset so the presets page renders a populated list.
  const presetsListMatch = url.pathname.match(/^\/internal\/projects\/([^/]+)\/presets$/);
  if (presetsListMatch && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    const projectId = presetsListMatch[1]!;
    const now = Date.now();
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-preset-1',
          projectId,
          name: 'default-run',
          harnessId: 'mock-harness-1',
          clientId: 'mock-client-1',
          inputs: { branch: 'main' },
          isDefault: true,
          createdAt: new Date(now - 60_000).toISOString(),
          updatedAt: new Date(now - 60_000).toISOString(),
        },
      ]),
    );
    return;
  }

  if (presetsListMatch && req.method === 'POST') {
    const projectId = presetsListMatch[1]!;
    readBody(req).then(() => {
      const now = Date.now();
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-preset-new',
          projectId,
          name: 'new-preset',
          harnessId: 'mock-harness-1',
          clientId: 'mock-client-1',
          inputs: {},
          isDefault: false,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        }),
      );
    });
    return;
  }

  const presetByIdMatch = url.pathname.match(/^\/internal\/presets\/([^/]+)$/);
  if (presetByIdMatch && req.method === 'DELETE') {
    res.writeHead(204).end();
    return;
  }

  const fromPresetMatch = url.pathname.match(/^\/internal\/runs\/from-preset\/([^/]+)$/);
  if (fromPresetMatch && req.method === 'POST') {
    readBody(req).then(() => {
      const now = Date.now();
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-run-from-preset',
          harnessId: 'mock-harness-1',
          projectId: 'mock-project-1',
          clientId: 'mock-client-1',
          triggeredByUserId: MOCK_DB_USER_ID,
          status: 'QUEUED',
          branchName: null,
          workingDir: null,
          startedAt: new Date(now).toISOString(),
          finishedAt: null,
        }),
      );
    });
    return;
  }

  // Individual harness fetch — used by the v2 detail page's harness preview
  // and the editor at /dashboard/harnesses/[id]. The id determines which
  // (name, version) pair we return so the editor + version sidebar render
  // consistent data with the GET /internal/harnesses?name= response.
  const harnessGetMatch = url.pathname.match(/^\/internal\/harnesses\/([^/]+)$/);
  if (harnessGetMatch && req.method === 'GET') {
    const id = harnessGetMatch[1]!;
    const versionFor: Record<string, number> = {
      'mock-harness-1': 1,
      'mock-harness-echo-v2': 2,
    };
    const version = versionFor[id] ?? 1;
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id,
        ownerId: MOCK_DB_USER_ID,
        name: 'echo',
        version,
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
        definition: {
          name: 'echo',
          version: 1,
          steps: [
            { id: 'step-read', type: 'tool', use: 'fs.read', with: { path: 'README.md' } },
            { id: 'step-write', type: 'tool', use: 'fs.write', with: { path: 'a.txt' } },
          ],
        },
      }),
    );
    return;
  }

  // Harness template catalog (N4 PR4 endpoint).
  if (url.pathname === '/internal/harness-templates' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'auto-fix-issue',
          title: 'Auto-fix GitHub issue',
          description: 'Reads an issue, plans, implements, opens a PR.',
          tags: ['github', 'llm', 'pr'],
        },
        {
          id: 'pr-review',
          title: 'PR review summary',
          description: 'Diffs a PR and posts an LLM review.',
          tags: ['github', 'llm'],
        },
      ]),
    );
    return;
  }
  const templateGetMatch = url.pathname.match(/^\/internal\/harness-templates\/([^/]+)$/);
  if (templateGetMatch && req.method === 'GET') {
    const id = templateGetMatch[1]!;
    const yamlByName: Record<string, string> = {
      'auto-fix-issue': `# title: Auto-fix GitHub issue
name: 'auto-fix-issue'
version: 1
steps:
  - id: read
    type: tool
    use: fs.read
    with: { path: 'README.md' }
`,
      'pr-review': `# title: PR review summary
name: 'pr-review'
version: 1
steps:
  - id: diff
    type: tool
    use: git.diff
`,
    };
    const yaml = yamlByName[id];
    if (!yaml) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id,
        title: id,
        description: 'mock template',
        tags: ['mock'],
        yaml,
      }),
    );
    return;
  }

  // Dry-run endpoint (N4 PR3). Returns an ok shape with two steps so the
  // editor's preview panel renders something realistic.
  if (url.pathname === '/internal/harnesses/dry-run' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          ok: true,
          harness: { name: 'mock', version: 1 },
          steps: [
            { stepId: 'one', status: 'success', durationMs: 1 },
            { stepId: 'two', status: 'success', durationMs: 1 },
          ],
          logs: [],
          llmCalls: [{ stepId: 'two', prompt: 'mock prompt' }],
          toolCalls: [{ stepId: 'one', tool: 'fs.read', input: { path: 'README.md' } }],
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/harnesses' && req.method === 'POST') {
    readBody(req).then((body) => {
      let parsed: { name?: string } = {};
      try {
        parsed = JSON.parse(body) as { name?: string };
      } catch {
        /* ignore */
      }
      const now = Date.now();
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-harness-saved',
          ownerId: MOCK_DB_USER_ID,
          name: parsed.name ?? 'unnamed',
          version: 1,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/harnesses' && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    const now = Date.now();
    const latest = url.searchParams.get('latest') !== 'false';
    const name = url.searchParams.get('name');
    // Two versions of "echo" + one version of "fix-issue" so the history
    // view + the latest-only view differ.
    const rows = [
      {
        id: 'mock-harness-echo-v2',
        ownerId: MOCK_DB_USER_ID,
        name: 'echo',
        version: 2,
        createdAt: new Date(now - 60_000).toISOString(),
        updatedAt: new Date(now - 30_000).toISOString(),
      },
      {
        id: 'mock-harness-1',
        ownerId: MOCK_DB_USER_ID,
        name: 'echo',
        version: 1,
        createdAt: new Date(now - 240_000).toISOString(),
        updatedAt: new Date(now - 240_000).toISOString(),
      },
      {
        id: 'mock-harness-fix',
        ownerId: MOCK_DB_USER_ID,
        name: 'fix-issue',
        version: 1,
        createdAt: new Date(now - 120_000).toISOString(),
        updatedAt: new Date(now - 90_000).toISOString(),
      },
    ];
    let out = rows;
    if (name) {
      out = rows.filter((r) => r.name === name);
    } else if (latest) {
      const seen = new Set<string>();
      out = rows.filter((r) => {
        if (seen.has(r.name)) return false;
        seen.add(r.name);
        return true;
      });
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    return;
  }

  if (url.pathname === '/internal/todos' && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    const source = url.searchParams.get('source');
    const now = Date.now();
    const all = [
      {
        id: 'mock-todo-1',
        projectId: 'mock-project-1',
        repoFullName: 'mock/repo',
        title: 'issue from github',
        body: 'imported from webhook',
        status: 'OPEN',
        sourceType: 'GITHUB_ISSUE',
        sourceRef: 42,
        createdAt: new Date(now - 600_000).toISOString(),
        updatedAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: 'mock-todo-2',
        projectId: 'mock-project-1',
        repoFullName: 'mock/repo',
        title: 'internal note',
        body: null,
        status: 'IN_PROGRESS',
        sourceType: 'INTERNAL',
        sourceRef: null,
        createdAt: new Date(now - 300_000).toISOString(),
        updatedAt: new Date(now - 30_000).toISOString(),
      },
      {
        id: 'mock-todo-3',
        projectId: 'mock-project-1',
        repoFullName: 'mock/repo',
        title: 'done task',
        body: null,
        status: 'DONE',
        sourceType: 'INTERNAL',
        sourceRef: null,
        createdAt: new Date(now - 900_000).toISOString(),
        updatedAt: new Date(now - 120_000).toISOString(),
      },
    ];
    const filtered = source ? all.filter((t) => t.sourceType === source) : all;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(filtered));
    return;
  }

  if (url.pathname === '/internal/todos' && req.method === 'POST') {
    readBody(req).then((body) => {
      let parsed: { projectId?: string; title?: string; body?: string } = {};
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        // ignore
      }
      const now = new Date().toISOString();
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-todo-new',
          projectId: parsed.projectId ?? 'mock-project-1',
          repoFullName: 'mock/repo',
          title: parsed.title ?? 'new',
          body: parsed.body ?? null,
          status: 'OPEN',
          sourceType: 'INTERNAL',
          sourceRef: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
    return;
  }

  const todoStatusMatch = url.pathname.match(/^\/internal\/todos\/([^/]+)\/status$/);
  if (todoStatusMatch && req.method === 'PATCH') {
    readBody(req).then((body) => {
      const id = todoStatusMatch[1]!;
      let parsed: { status?: string } = {};
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        // ignore
      }
      const now = new Date().toISOString();
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id,
          projectId: 'mock-project-1',
          repoFullName: 'mock/repo',
          title: 'updated',
          body: null,
          status: parsed.status ?? 'OPEN',
          sourceType: 'INTERNAL',
          sourceRef: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
    return;
  }

  // Runs search (N6). Honors the status filter so the e2e can assert the
  // filtered result; q narrows to a single row. Pagination echoes page back.
  if (url.pathname === '/internal/runs/search' && req.method === 'GET') {
    if (emptyFixtures) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ page: 1, pageSize: 25, total: 0, items: [] }));
      return;
    }
    const now = Date.now();
    const all = [
      {
        id: 'mock-run-7',
        harnessId: 'mock-harness-1',
        projectId: 'mock-project-1',
        clientId: 'mock-client-1',
        triggeredByUserId: MOCK_DB_USER_ID,
        status: 'SUCCESS',
        branchName: 'feat/login',
        workingDir: null,
        startedAt: new Date(now - 120_000).toISOString(),
        finishedAt: new Date(now - 60_000).toISOString(),
        repoFullName: 'mock/repo',
        harnessName: 'echo',
        harnessVersion: 1,
      },
      {
        id: 'mock-run-6',
        harnessId: 'mock-harness-1',
        projectId: 'mock-project-1',
        clientId: 'mock-client-1',
        triggeredByUserId: MOCK_DB_USER_ID,
        status: 'FAILED',
        branchName: null,
        workingDir: null,
        startedAt: new Date(now - 600_000).toISOString(),
        finishedAt: new Date(now - 580_000).toISOString(),
        repoFullName: 'mock/repo',
        harnessName: 'echo',
        harnessVersion: 1,
      },
    ];
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    let items = all;
    if (status) items = items.filter((r) => r.status === status);
    if (q) items = items.filter((r) => r.id.startsWith(q) || (r.branchName ?? '').includes(q));
    const page = Number(url.searchParams.get('page') ?? '1');
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ page, pageSize: 25, total: items.length, items }));
    return;
  }

  if (url.pathname === '/internal/runs/stats' && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          sinceHours: 168,
          total: 0,
          counts: {},
          successRate: null,
          totalCostUsd: 0,
          avgCostUsd: 0,
          terminalCount: 0,
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        sinceHours: 168,
        total: 5,
        counts: { SUCCESS: 3, FAILED: 1, QUEUED: 1 },
        successRate: 3 / 4,
        totalCostUsd: 0.0234,
        avgCostUsd: 0.00585,
        terminalCount: 4,
      }),
    );
    return;
  }

  if (
    url.pathname === '/internal/runs' &&
    req.method === 'GET' &&
    url.searchParams.has('projectId')
  ) {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    const now = Date.now();
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-run-7',
          harnessId: 'mock-harness-1',
          projectId: 'mock-project-1',
          clientId: 'mock-client-1',
          triggeredByUserId: MOCK_DB_USER_ID,
          status: 'SUCCESS',
          branchName: 'feat/mock',
          workingDir: null,
          startedAt: new Date(now - 120_000).toISOString(),
          finishedAt: new Date(now - 60_000).toISOString(),
        },
      ]),
    );
    return;
  }

  if (
    url.pathname === '/internal/runs' &&
    req.method === 'GET' &&
    url.searchParams.has('ownerId')
  ) {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    const now = Date.now();
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-run-7',
          harnessId: 'mock-harness-1',
          projectId: 'mock-project-1',
          clientId: 'mock-client-1',
          triggeredByUserId: MOCK_DB_USER_ID,
          status: 'SUCCESS',
          branchName: 'feat/mock',
          workingDir: null,
          startedAt: new Date(now - 120_000).toISOString(),
          finishedAt: new Date(now - 60_000).toISOString(),
          repoFullName: 'mock/repo',
        },
        {
          id: 'mock-run-6',
          harnessId: 'mock-harness-1',
          projectId: 'mock-project-1',
          clientId: 'mock-client-1',
          triggeredByUserId: MOCK_DB_USER_ID,
          status: 'FAILED',
          branchName: null,
          workingDir: null,
          startedAt: new Date(now - 600_000).toISOString(),
          finishedAt: new Date(now - 580_000).toISOString(),
          repoFullName: 'mock/repo',
        },
      ]),
    );
    return;
  }

  if (url.pathname === '/internal/runs' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(201, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'mock-created-run-1',
          harnessId: 'mock-harness-1',
          projectId: 'mock-project-1',
          clientId: 'mock-client-1',
          triggeredByUserId: MOCK_DB_USER_ID,
          status: 'QUEUED',
          branchName: null,
          workingDir: null,
          startedAt: new Date().toISOString(),
          finishedAt: null,
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/clients/pairings' && req.method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          token: 'mock-pairing-token-abcdef0123456789',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      );
    });
    return;
  }

  if (url.pathname === '/internal/clients' && req.method === 'GET') {
    if (emptyFixtures) {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          id: 'mock-client-1',
          name: 'Mock Laptop',
          hostname: 'host-1',
          os: 'darwin',
          version: '0.0.0',
          status: 'ONLINE',
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          id: 'mock-client-2',
          name: 'Mock Server',
          hostname: 'host-2',
          os: 'linux',
          version: '0.0.0',
          status: 'OFFLINE',
          lastSeenAt: null,
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ]),
    );
    return;
  }

  // Run timeline (N6) — must precede the /internal/runs/:id match below.
  const timelineMatch = url.pathname.match(/^\/internal\/runs\/([^/]+)\/timeline$/);
  if (timelineMatch && req.method === 'GET') {
    const id = timelineMatch[1]!;
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        runId: id,
        startedAt: new Date(Date.now() - 10_000).toISOString(),
        finishedAt: new Date().toISOString(),
        totalMs: 10_000,
        longestStepIndex: 1,
        steps: [
          {
            stepIndex: 0,
            stepId: 'read',
            kind: 'TOOL',
            status: 'SUCCESS',
            startOffsetMs: 0,
            durationMs: 2000,
          },
          {
            stepIndex: 1,
            stepId: 'think',
            kind: 'LLM',
            status: 'SUCCESS',
            startOffsetMs: 2000,
            durationMs: 7000,
          },
        ],
      }),
    );
    return;
  }

  const runMatch = url.pathname.match(/^\/internal\/runs\/([^/]+)$/);
  if (runMatch && req.method === 'GET') {
    const id = runMatch[1]!;
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id,
        harnessId: 'h-1',
        projectId: 'p-1',
        clientId: 'c-1',
        triggeredByUserId: 'u-1',
        status: 'SUCCESS',
        branchName: 'feat/mock',
        workingDir: null,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        finishedAt: new Date().toISOString(),
        steps: [
          {
            id: 'step-a',
            stepIndex: 0,
            stepId: 'plan',
            kind: 'LLM',
            status: 'SUCCESS',
            durationMs: 1200,
            error: null,
            createdAt: new Date(Date.now() - 30_000).toISOString(),
          },
        ],
        logs: [
          {
            id: 'log-a',
            ts: new Date(Date.now() - 30_000).toISOString(),
            level: 'INFO',
            source: 'plan',
            message: 'planning',
          },
          {
            id: 'log-b',
            ts: new Date().toISOString(),
            level: 'INFO',
            source: 'plan',
            message: 'done',
          },
        ],
      }),
    );
    return;
  }

  res.writeHead(404).end(`mock-server: no route ${req.method} ${url.pathname}`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export const MOCK_VALUES = {
  USER: MOCK_USER,
  DB_USER_ID: MOCK_DB_USER_ID,
  ACCESS_TOKEN: MOCK_ACCESS_TOKEN,
  CODE: MOCK_CODE,
};
