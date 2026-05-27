// Socket.io event payloads for project clone orchestration. The api dispatches
// CLONE_EVENTS.Start to the paired client when the operator opts in to
// "Clone & register" on the repo picker; the sidecar reports progress back via
// the HTTP webhook (POST /internal/projects/:id/clone-status), not over the
// socket — clone is a single long-running operation and an HTTP request fits
// the retry/idempotency story better than streaming socket events.

export const CLONE_EVENTS = {
  /** api → client: start cloning the repo for the given project. */
  Start: 'client:cloneProject',
} as const;

export type CloneEvent = (typeof CLONE_EVENTS)[keyof typeof CLONE_EVENTS];

export interface CloneStartPayload {
  /** Project DB id — used as the path in the status-report webhook URL. */
  projectId: string;
  /** GitHub installation id, used to mint a short-lived token at clone time. */
  installationId: number;
  /** "owner/name" — used to construct the clone URL. */
  repoFullName: string;
  /** Absolute filesystem path on the client where the working tree lives. */
  targetPath: string;
  /** When true, the sidecar creates a bare repo + per-branch worktrees. */
  useWorktrees?: boolean;
}

export type CloneStatusReport =
  | { status: 'CLONING' }
  | { status: 'READY' }
  | { status: 'FAILED'; error: string };
