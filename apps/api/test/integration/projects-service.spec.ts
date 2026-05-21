import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../../src/projects/projects.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GithubAppService } from '../../src/github/github-app.service';

const prisma = new PrismaClient();

class FakeGithubApp extends GithubAppService {
  public repoToReturn: { id: number; full_name: string } | 'not-found' = {
    id: 999_111,
    full_name: 'octocat/Hello-World',
  };

  override async installationOctokit(): Promise<never> {
    // Returns a tiny shim satisfying ProjectsService's usage of `repos.get`.
    const repo = this.repoToReturn;
    const get =
      repo === 'not-found'
        ? () => {
            const err = new Error('Not Found');
            (err as { status?: number }).status = 404;
            throw err;
          }
        : () => Promise.resolve({ data: repo });
    return { repos: { get } } as unknown as never;
  }
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.runLog.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.harnessRun.deleteMany();
  await prisma.githubEvent.deleteMany();
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
});

describe('ProjectsService.createFromGithub', () => {
  it('creates a project after resolving repo via GitHub App', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 100, login: 'alice', role: UserRole.OWNER },
    });
    const fakeApp = new FakeGithubApp();
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);

    const project = await svc.createFromGithub({
      ownerId: owner.id,
      installationId: 7777,
      repoFullName: 'octocat/Hello-World',
      localRoot: '/tmp/hello',
    });

    expect(project.repoFullName).toBe('octocat/Hello-World');
    expect(project.githubRepoId).toBe(999_111);
    expect(project.githubInstallationId).toBe(7777);
  });

  it('rejects with NotFoundException when the GitHub repo lookup 404s', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 101, login: 'bob', role: UserRole.OWNER },
    });
    const fakeApp = new FakeGithubApp();
    fakeApp.repoToReturn = 'not-found';
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);

    await expect(
      svc.createFromGithub({
        ownerId: owner.id,
        installationId: 7777,
        repoFullName: 'octocat/Nonexistent',
        localRoot: '/tmp/none',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with ConflictException when the same owner already has the repo', async () => {
    const owner = await prisma.user.create({
      data: { githubId: 102, login: 'carol', role: UserRole.OWNER },
    });
    const fakeApp = new FakeGithubApp();
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);

    await svc.createFromGithub({
      ownerId: owner.id,
      installationId: 1,
      repoFullName: 'octocat/Hello-World',
      localRoot: '/tmp/a',
    });

    await expect(
      svc.createFromGithub({
        ownerId: owner.id,
        installationId: 2,
        repoFullName: 'octocat/Hello-World',
        localRoot: '/tmp/b',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProjectsService.listByOwner', () => {
  it('returns only projects of the requested owner, ordered by createdAt desc', async () => {
    const a = await prisma.user.create({
      data: { githubId: 200, login: 'a', role: UserRole.OWNER },
    });
    const b = await prisma.user.create({
      data: { githubId: 201, login: 'b', role: UserRole.OWNER },
    });

    const fakeApp = new FakeGithubApp();
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);

    fakeApp.repoToReturn = { id: 1, full_name: 'a/r1' };
    await svc.createFromGithub({
      ownerId: a.id,
      installationId: 1,
      repoFullName: 'a/r1',
      localRoot: '/tmp/1',
    });
    // Two creates in the same millisecond produce a tied createdAt and the
    // `orderBy: { createdAt: desc }` is then unstable. Sleep > 1ms to force
    // distinct timestamps and keep the assertion deterministic.
    await new Promise((r) => setTimeout(r, 5));
    fakeApp.repoToReturn = { id: 2, full_name: 'a/r2' };
    await svc.createFromGithub({
      ownerId: a.id,
      installationId: 1,
      repoFullName: 'a/r2',
      localRoot: '/tmp/2',
    });
    fakeApp.repoToReturn = { id: 3, full_name: 'b/r3' };
    await svc.createFromGithub({
      ownerId: b.id,
      installationId: 1,
      repoFullName: 'b/r3',
      localRoot: '/tmp/3',
    });

    const aList = await svc.listByOwner(a.id);
    expect(aList.map((p) => p.repoFullName)).toEqual(['a/r2', 'a/r1']);

    const bList = await svc.listByOwner(b.id);
    expect(bList.map((p) => p.repoFullName)).toEqual(['b/r3']);
  });
});

describe('ProjectsService.getDetail', () => {
  it('returns runCount + lastRun + lastEvent + default associations', async () => {
    const user = await prisma.user.create({
      data: { githubId: 300, login: 'd-owner', role: UserRole.OWNER },
    });
    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        githubInstallationId: 1,
        githubRepoId: 10,
        repoFullName: 'd/repo',
        localRoot: '/tmp/d',
      },
    });
    const harness = await prisma.harness.create({
      data: { ownerId: user.id, name: 'h', definition: { name: 'h', version: 1, steps: [] } },
    });
    const client = await prisma.client.create({
      data: { ownerId: user.id, name: 'c', jwtTokenHash: 'h' },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { defaultClientId: client.id, defaultHarnessId: harness.id },
    });
    await prisma.harnessRun.create({
      data: {
        harnessId: harness.id,
        projectId: project.id,
        clientId: client.id,
        triggeredByUserId: user.id,
      },
    });
    await prisma.githubEvent.create({
      data: {
        deliveryId: 'd-detail-1',
        eventType: 'issues',
        action: 'opened',
        projectId: project.id,
        payload: { x: 1 },
      },
    });

    const fakeApp = new FakeGithubApp();
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);
    const detail = await svc.getDetail(project.id);
    expect(detail.runCount).toBe(1);
    expect(detail.lastRun?.id).toBeTruthy();
    expect(detail.lastEvent?.eventType).toBe('issues');
    expect(detail.project.defaultClient?.name).toBe('c');
    expect(detail.project.defaultHarness?.name).toBe('h');
  });

  it('throws NotFoundException when project does not exist', async () => {
    const fakeApp = new FakeGithubApp();
    const svc = new ProjectsService(prisma as unknown as PrismaService, fakeApp);
    await expect(svc.getDetail('does-not-exist')).rejects.toThrow(/not found/);
  });
});
