import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubAppService } from './github-app.service';

export interface OpenPullRequestInput {
  projectId: string;
  head: string;
  base?: string;
  title: string;
  body?: string;
  draft?: boolean;
}

export interface OpenedPullRequest {
  url: string;
  number: number;
}

@Injectable()
export class GithubPrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly app: GithubAppService,
  ) {}

  async open(input: OpenPullRequestInput): Promise<OpenedPullRequest> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { repoFullName: true, githubInstallationId: true },
    });
    if (!project) throw new NotFoundException(`project ${input.projectId} not found`);

    const [owner, repo] = project.repoFullName.split('/');
    if (!owner || !repo) {
      throw new Error(`invalid repoFullName "${project.repoFullName}"`);
    }

    const octokit = await this.app.installationOctokit(project.githubInstallationId);
    const res = await octokit.pulls.create({
      owner,
      repo,
      head: input.head,
      base: input.base ?? 'main',
      title: input.title,
      body: input.body,
      draft: input.draft,
    });
    return { url: res.data.html_url, number: res.data.number };
  }
}
