import { internalFetch } from './internal';

export interface ProjectSummary {
  id: string;
  repoFullName: string;
  githubInstallationId: number;
  localRoot: string;
  createdAt: string;
}

export interface CreateProjectInput {
  ownerId: string;
  installationId: number;
  repoFullName: string;
  localRoot: string;
  /** Optional FK to GithubInstallation when the project was created via the
   *  new repo picker. The api copies this onto Project.installationDbId. */
  installationDbId?: string;
}

export async function listProjectsByOwner(ownerId: string): Promise<ProjectSummary[]> {
  const res = await internalFetch(`/internal/projects?ownerId=${encodeURIComponent(ownerId)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listProjectsByOwner failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ProjectSummary[];
}

export interface CreateProjectResult {
  id: string;
  repoFullName: string;
  githubRepoId: number;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  const res = await internalFetch('/internal/projects', { method: 'POST', body: input });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createProject failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CreateProjectResult;
}

export type CloneStatus = 'NOT_CLONED' | 'CLONING' | 'READY' | 'FAILED';

export interface ProjectDetail extends ProjectSummary {
  githubRepoId: number;
  worktreePolicy: string;
  cloneStatus: CloneStatus;
  cloneError: string | null;
  cloneCompletedAt: string | null;
  updatedAt: string;
  defaultClient: { id: string; name: string; status: string } | null;
  defaultHarness: { id: string; name: string; version: number } | null;
  defaultHarnessVersion: number | null;
  runCount: number;
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  lastEvent: {
    id: string;
    eventType: string;
    action: string | null;
    receivedAt: string;
  } | null;
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await internalFetch(`/internal/projects/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getProject failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ProjectDetail;
}

export interface UpdateProjectDefaultsInput {
  defaultHarnessId?: string | null;
  defaultHarnessVersion?: number | null;
  defaultClientId?: string | null;
}

// PATCH the project's default harness / client / pinned version. Pass null
// to unset a field; omit a field to leave it unchanged.
export async function updateProjectDefaults(
  projectId: string,
  patch: UpdateProjectDefaultsInput,
): Promise<{
  id: string;
  defaultHarnessId: string | null;
  defaultHarnessVersion: number | null;
  defaultClientId: string | null;
}> {
  const res = await internalFetch(`/internal/projects/${encodeURIComponent(projectId)}/defaults`, {
    method: 'PATCH',
    body: patch,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`updateProjectDefaults failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    id: string;
    defaultHarnessId: string | null;
    defaultHarnessVersion: number | null;
    defaultClientId: string | null;
  };
}

export interface DispatchCloneInput {
  projectId: string;
  clientId: string;
  targetPath: string;
  useWorktrees?: boolean;
}

// Asks the api to broadcast `client:cloneProject` to the paired sidecar.
// Returns once the api has flipped cloneStatus to CLONING; the actual clone
// progresses async and the sidecar reports back via the clone-status
// webhook. The UI polls Project.cloneStatus to surface progress.
export async function dispatchClone(input: DispatchCloneInput): Promise<void> {
  const res = await internalFetch(
    `/internal/projects/${encodeURIComponent(input.projectId)}/clone`,
    {
      method: 'POST',
      body: {
        clientId: input.clientId,
        targetPath: input.targetPath,
        ...(input.useWorktrees ? { useWorktrees: true } : {}),
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`dispatchClone failed: ${res.status} ${text}`);
  }
}
