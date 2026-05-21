import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GithubAppService } from './github-app.service';
import { GithubPrService } from './github-pr.service';
import type { PrismaService } from '../prisma/prisma.service';

function makeService(opts: {
  project?: { repoFullName: string; githubInstallationId: number } | null;
  create?: ReturnType<typeof vi.fn>;
}) {
  const create =
    opts.create ??
    vi.fn().mockResolvedValue({ data: { html_url: 'https://github.com/o/r/pull/9', number: 9 } });
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue(opts.project ?? null) },
  } as unknown as PrismaService;
  const app = {
    installationOctokit: vi.fn().mockResolvedValue({ pulls: { create } }),
  } as unknown as GithubAppService;
  return { svc: new GithubPrService(prisma, app), create, prisma, app };
}

describe('GithubPrService.open', () => {
  it('opens a PR against the project repo with default base=main', async () => {
    const { svc, create } = makeService({
      project: { repoFullName: 'o/r', githubInstallationId: 42 },
    });
    const out = await svc.open({
      projectId: 'p-1',
      head: 'feat/x',
      title: 'auto',
      body: 'body',
    });
    expect(out).toEqual({ url: 'https://github.com/o/r/pull/9', number: 9 });
    expect(create).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      head: 'feat/x',
      base: 'main',
      title: 'auto',
      body: 'body',
      draft: undefined,
    });
  });

  it('passes through an explicit base + draft', async () => {
    const { svc, create } = makeService({
      project: { repoFullName: 'a/b', githubInstallationId: 1 },
    });
    await svc.open({
      projectId: 'p-1',
      head: 'feat/x',
      base: 'develop',
      title: 't',
      draft: true,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'a', repo: 'b', base: 'develop', draft: true }),
    );
  });

  it('throws NotFoundException for unknown project', async () => {
    const { svc } = makeService({ project: null });
    await expect(
      svc.open({ projectId: 'missing', head: 'h', title: 't' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws on malformed repoFullName', async () => {
    const { svc } = makeService({
      project: { repoFullName: 'no-slash', githubInstallationId: 1 },
    });
    await expect(svc.open({ projectId: 'p', head: 'h', title: 't' })).rejects.toThrow(
      /invalid repoFullName/,
    );
  });
});
