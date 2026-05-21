import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateProjectInput {
  ownerId: string;
  installationId: number;
  repoFullName: string; // e.g. "octocat/Hello-World"
  localRoot: string;
}

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
}

function splitRepoFullName(full: string): [string, string] {
  const parts = full.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repoFullName "${full}", expected "owner/name"`);
  }
  return [parts[0], parts[1]];
}
