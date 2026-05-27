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

export interface ProjectDetail extends ProjectSummary {
  githubRepoId: number;
  worktreePolicy: string;
  updatedAt: string;
  defaultClient: { id: string; name: string; status: string } | null;
  defaultHarness: { id: string; name: string; version: number } | null;
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
