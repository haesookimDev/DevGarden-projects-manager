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
