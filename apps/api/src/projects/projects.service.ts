import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloneStatus, type Project } from '@prisma/client';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateProjectInput {
  ownerId: string;
  installationId: number;
  repoFullName: string; // e.g. "octocat/Hello-World"
  localRoot: string;
  /** Optional FK to GithubInstallation when the project was created via the
   *  new repo picker. Lets the picker / settings UI navigate from project to
   *  installation without re-resolving by numeric id. */
  installationDbId?: string;
}

export type CloneStatusUpdate =
  | { status: 'CLONING' }
  | { status: 'READY' }
  | { status: 'FAILED'; error: string }
  | { status: 'NOT_CLONED' };

// Allowed transitions for Project.cloneStatus. Anything not listed is rejected
// so a late / out-of-order sidecar report can't move a successful clone back
// to CLONING or overwrite a FAILED state with another FAILED.
const CLONE_TRANSITIONS: Record<CloneStatus, CloneStatus[]> = {
  NOT_CLONED: ['CLONING'],
  CLONING: ['READY', 'FAILED'],
  READY: ['CLONING'], // re-clone is allowed
  FAILED: ['CLONING'], // retry is allowed
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubApp: GithubAppService,
  ) {}

  async createFromGithub(input: CreateProjectInput): Promise<Project> {
    const [owner, repo] = splitRepoFullName(input.repoFullName);

    const octokit = await this.githubApp.installationOctokit(input.installationId);
    let repoMeta;
    try {
      const res = await octokit.repos.get({ owner, repo });
      repoMeta = res.data;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        throw new NotFoundException(
          `Repository ${input.repoFullName} not found for installation ${input.installationId}`,
        );
      }
      throw err;
    }

    const existing = await this.prisma.project.findUnique({
      where: {
        ownerId_githubRepoId: { ownerId: input.ownerId, githubRepoId: repoMeta.id },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Project already exists for ${input.repoFullName} (owner ${input.ownerId})`,
      );
    }

    return this.prisma.project.create({
      data: {
        ownerId: input.ownerId,
        githubInstallationId: input.installationId,
        installationDbId: input.installationDbId ?? null,
        githubRepoId: repoMeta.id,
        repoFullName: repoMeta.full_name,
        localRoot: input.localRoot,
      },
    });
  }

  listByOwner(ownerId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDetail(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        defaultClient: { select: { id: true, name: true, status: true } },
        defaultHarness: { select: { id: true, name: true, version: true } },
      },
    });
    if (!project) throw new NotFoundException(`project ${id} not found`);

    const [runCount, lastRun, lastEvent] = await Promise.all([
      this.prisma.harnessRun.count({ where: { projectId: id } }),
      this.prisma.harnessRun.findFirst({
        where: { projectId: id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, startedAt: true, finishedAt: true },
      }),
      this.prisma.githubEvent.findFirst({
        where: { projectId: id },
        orderBy: { receivedAt: 'desc' },
        select: { id: true, eventType: true, action: true, receivedAt: true },
      }),
    ]);

    return { project, runCount, lastRun, lastEvent };
  }

  // Sidecar reports clone progress to the api after PR3 wires the HTTP route.
  // This method is the state-machine guard: only the transitions in
  // CLONE_TRANSITIONS are accepted; anything else throws BadRequest so the
  // caller knows their report was dropped.
  async updateCloneStatus(id: string, update: CloneStatusUpdate): Promise<Project> {
    const current = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, cloneStatus: true },
    });
    if (!current) throw new NotFoundException(`project ${id} not found`);

    const next = update.status as CloneStatus;
    const allowed = CLONE_TRANSITIONS[current.cloneStatus];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid clone status transition ${current.cloneStatus} → ${next}`,
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        cloneStatus: next,
        cloneError: update.status === 'FAILED' ? update.error : null,
        cloneCompletedAt: update.status === 'READY' ? new Date() : null,
      },
    });
  }
}

export interface ProjectDetail {
  project: Project & {
    defaultClient: { id: string; name: string; status: string } | null;
    defaultHarness: { id: string; name: string; version: number } | null;
  };
  runCount: number;
  lastRun: { id: string; status: string; startedAt: Date; finishedAt: Date | null } | null;
  lastEvent: { id: string; eventType: string; action: string | null; receivedAt: Date } | null;
}

function splitRepoFullName(full: string): [string, string] {
  const parts = full.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repoFullName "${full}", expected "owner/name"`);
  }
  return [parts[0], parts[1]];
}
