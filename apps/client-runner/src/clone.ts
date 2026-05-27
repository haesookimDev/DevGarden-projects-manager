// Sidecar-side implementation of the `client:cloneProject` IPC.
//
// Boot order (per N3 plan §3.3):
//   1. Tell the api the clone has started (POST /internal/projects/:id/clone-status).
//   2. Mint an installation token (POST /internal/clients/installation-tokens).
//   3. Build an authenticated HTTPS clone URL and run `git clone` (or
//      `git clone --bare` + `git worktree add` when useWorktrees is on).
//   4. Tell the api the clone finished (READY) or failed (FAILED + error).
//
// Network calls go through `fetch` (Node 22 native) so unit tests can stub a
// fake fetch without dragging in undici. The child_process spawn is also
// injectable for the same reason.
//
// The api endpoints invoked here land in N3 PR3; this module only encodes the
// contract from the sidecar side.

import { spawn as defaultSpawn, type SpawnOptions } from 'node:child_process';
import { mkdir as defaultMkdir, stat as defaultStat } from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { CloneStartPayload } from '@devgarden/shared';

export interface CloneDeps {
  fetch?: typeof globalThis.fetch;
  spawn?: typeof defaultSpawn;
  mkdir?: typeof defaultMkdir;
  stat?: typeof defaultStat;
  /** Sidecar bootstrap values — passed in so this module stays pure. */
  apiBaseUrl: string;
  jwt: string;
  /** Optional override for the git binary location (mainly for tests). */
  gitBin?: string;
}

export interface CloneResult {
  ok: true;
  targetPath: string;
  bareDir?: string;
}

export interface CloneFailure {
  ok: false;
  error: string;
}

export async function cloneProject(
  payload: CloneStartPayload,
  deps: CloneDeps,
): Promise<CloneResult | CloneFailure> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const spawnFn = deps.spawn ?? defaultSpawn;
  const mkdirFn = deps.mkdir ?? defaultMkdir;
  const statFn = deps.stat ?? defaultStat;
  const git = deps.gitBin ?? 'git';

  try {
    await assertTargetUsable(payload.targetPath, statFn);
    await reportStatus(fetchFn, deps, payload.projectId, { status: 'CLONING' });

    const token = await mintInstallationToken(fetchFn, deps, payload.installationId);
    const url = buildCloneUrl(payload.repoFullName, token);

    if (payload.useWorktrees) {
      const bareDir = nodePath.join(payload.targetPath, '.bare');
      await mkdirFn(bareDir, { recursive: true });
      await runGit(spawnFn, git, ['clone', '--bare', url, bareDir]);
      // A "main" worktree under <targetPath>/main keeps the bare repo + the
      // working trees siblings, matching the layout we want for v0.3 multi-
      // branch routing.
      const mainWt = nodePath.join(payload.targetPath, 'main');
      await runGit(spawnFn, git, ['--git-dir', bareDir, 'worktree', 'add', mainWt, 'HEAD']);
      await reportStatus(fetchFn, deps, payload.projectId, { status: 'READY' });
      return { ok: true, targetPath: payload.targetPath, bareDir };
    }

    await mkdirFn(nodePath.dirname(payload.targetPath), { recursive: true });
    await runGit(spawnFn, git, ['clone', url, payload.targetPath]);
    await reportStatus(fetchFn, deps, payload.projectId, { status: 'READY' });
    return { ok: true, targetPath: payload.targetPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort FAILED report; if even the webhook fails we still want the
    // original error surfaced to the caller.
    try {
      await reportStatus(fetchFn, deps, payload.projectId, {
        status: 'FAILED',
        error: redactToken(message),
      });
    } catch {
      /* swallow — surface the original error */
    }
    return { ok: false, error: redactToken(message) };
  }
}

async function assertTargetUsable(target: string, statFn: typeof defaultStat): Promise<void> {
  try {
    await statFn(target);
    // Path exists — refuse rather than overwriting. The web UI is expected to
    // pick a fresh path; this is the safety net.
    throw new Error(`target path already exists: ${target}`);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

async function mintInstallationToken(
  fetchFn: typeof globalThis.fetch,
  deps: CloneDeps,
  installationId: number,
): Promise<string> {
  const url = `${deps.apiBaseUrl.replace(/\/$/, '')}/internal/clients/installation-tokens`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ installationId }),
  });
  if (!res.ok) {
    throw new Error(`installation token request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { token?: unknown };
  if (typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error('installation token response missing "token"');
  }
  return body.token;
}

async function reportStatus(
  fetchFn: typeof globalThis.fetch,
  deps: CloneDeps,
  projectId: string,
  body: { status: 'CLONING' | 'READY' } | { status: 'FAILED'; error: string },
): Promise<void> {
  const url = `${deps.apiBaseUrl.replace(/\/$/, '')}/internal/projects/${projectId}/clone-status`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`clone-status webhook ${body.status} failed: ${res.status} ${res.statusText}`);
  }
}

function buildCloneUrl(repoFullName: string, token: string): string {
  if (!repoFullName.includes('/')) {
    throw new Error(`invalid repoFullName "${repoFullName}", expected "owner/name"`);
  }
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repoFullName}.git`;
}

async function runGit(spawnFn: typeof defaultSpawn, bin: string, args: string[]): Promise<void> {
  const opts: SpawnOptions = { stdio: ['ignore', 'pipe', 'pipe'] };
  const child = spawnFn(bin, args, opts);
  const stderr: Buffer[] = [];
  child.stderr?.on('data', (c: Buffer) => stderr.push(c));
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (exitCode !== 0) {
    const tail = Buffer.concat(stderr).toString('utf8').slice(-500);
    throw new Error(`git ${args[0]} exited ${exitCode}: ${tail.trim()}`);
  }
}

// Installation tokens look like `ghs_<32 alnum>`. We strip them from any
// error message that bubbles up to the api so a stack trace doesn't leak
// short-lived credentials.
function redactToken(message: string): string {
  return message.replace(/ghs_[A-Za-z0-9]+/g, 'ghs_***');
}
