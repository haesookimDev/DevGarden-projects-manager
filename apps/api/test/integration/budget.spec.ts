// Integration tests for BudgetService (CRUD + threshold detection) and
// BudgetMonitorService (notifier seam). N6 PR9.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, RunStatus, UserRole } from '@prisma/client';
import { BudgetService } from '../../src/budget/budget.service';
import { BudgetMonitorService, type BudgetNotifier } from '../../src/budget/budget-monitor.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaClient();
const svc = new BudgetService(prisma as unknown as PrismaService);

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
  await prisma.client.deleteMany();
  await prisma.harness.deleteMany();
  await prisma.project.deleteMany();
  await prisma.ownerBudget.deleteMany();
  await prisma.user.deleteMany();
});

async function seedOwnerWithSpend(spend: number) {
  const owner = await prisma.user.create({
    data: {
      githubId: 9400 + Math.floor(Math.random() * 1000),
      login: 'b-owner',
      role: UserRole.OWNER,
    },
  });
  const project = await prisma.project.create({
    data: {
      ownerId: owner.id,
      githubInstallationId: 1,
      githubRepoId: 1,
      repoFullName: 'b/p',
      localRoot: '/tmp/b',
    },
  });
  const harness = await prisma.harness.create({
    data: { ownerId: owner.id, name: 'h', definition: {} },
  });
  const client = await prisma.client.create({
    data: { ownerId: owner.id, name: 'c', jwtTokenHash: 'h' },
  });
  if (spend > 0) {
    await prisma.harnessRun.create({
      data: {
        harnessId: harness.id,
        projectId: project.id,
        clientId: client.id,
        triggeredByUserId: owner.id,
        status: RunStatus.SUCCESS,
        startedAt: new Date(),
        costUsd: spend,
      },
    });
  }
  return owner;
}

describe('BudgetService CRUD', () => {
  it('returns defaults when no budget row exists', async () => {
    const owner = await seedOwnerWithSpend(0);
    const view = await svc.get(owner.id);
    expect(view).toMatchObject({ monthlyUsdLimit: null, warnAt: 80, resetDay: 1 });
  });

  it('upsert creates then updates', async () => {
    const owner = await seedOwnerWithSpend(0);
    const created = await svc.upsert(owner.id, { monthlyUsdLimit: 50, warnAt: 75, resetDay: 5 });
    expect(created).toMatchObject({ monthlyUsdLimit: 50, warnAt: 75, resetDay: 5 });
    const updated = await svc.upsert(owner.id, { monthlyUsdLimit: 100 });
    expect(updated.monthlyUsdLimit).toBe(100);
    expect(updated.warnAt).toBe(75); // untouched
  });

  it('rejects warnAt out of range', async () => {
    const owner = await seedOwnerWithSpend(0);
    await expect(svc.upsert(owner.id, { warnAt: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.upsert(owner.id, { warnAt: 101 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects resetDay out of range', async () => {
    const owner = await seedOwnerWithSpend(0);
    await expect(svc.upsert(owner.id, { resetDay: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.upsert(owner.id, { resetDay: 29 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('BudgetService.status', () => {
  it('is ok with no limit set', async () => {
    const owner = await seedOwnerWithSpend(100);
    const status = await svc.status(owner.id);
    expect(status.threshold).toBe('ok');
    expect(status.limitUsd).toBeNull();
  });

  it('is ok below warnAt', async () => {
    const owner = await seedOwnerWithSpend(5);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100, warnAt: 80 });
    const status = await svc.status(owner.id);
    expect(status.threshold).toBe('ok');
    expect(status.spendUsd).toBeCloseTo(5, 2);
  });

  it('is warn at/above warnAt but below 100%', async () => {
    const owner = await seedOwnerWithSpend(85);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100, warnAt: 80 });
    const status = await svc.status(owner.id);
    expect(status.threshold).toBe('warn');
  });

  it('is exceeded at/above 100%', async () => {
    const owner = await seedOwnerWithSpend(120);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100, warnAt: 80 });
    const status = await svc.status(owner.id);
    expect(status.threshold).toBe('exceeded');
  });
});

describe('BudgetMonitorService', () => {
  it('calls the notifier on warn with the budget-warn kind', async () => {
    const owner = await seedOwnerWithSpend(90);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100, warnAt: 80 });
    const notify = vi.fn();
    const notifier: BudgetNotifier = { notify };
    const monitor = new BudgetMonitorService(svc, notifier);

    await monitor.checkAfterRun(owner.id);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0]).toMatchObject({ ownerId: owner.id, kind: 'budget-warn' });
  });

  it('calls the notifier on exceeded', async () => {
    const owner = await seedOwnerWithSpend(150);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100 });
    const notify = vi.fn();
    const monitor = new BudgetMonitorService(svc, { notify });
    await monitor.checkAfterRun(owner.id);
    expect(notify.mock.calls[0]![0]).toMatchObject({ kind: 'budget-exceeded' });
  });

  it('does not notify when under budget', async () => {
    const owner = await seedOwnerWithSpend(10);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100 });
    const notify = vi.fn();
    const monitor = new BudgetMonitorService(svc, { notify });
    const status = await monitor.checkAfterRun(owner.id);
    expect(notify).not.toHaveBeenCalled();
    expect(status?.threshold).toBe('ok');
  });

  it('works with no notifier wired (logs only, never throws)', async () => {
    const owner = await seedOwnerWithSpend(120);
    await svc.upsert(owner.id, { monthlyUsdLimit: 100 });
    const monitor = new BudgetMonitorService(svc);
    const status = await monitor.checkAfterRun(owner.id);
    expect(status?.threshold).toBe('exceeded');
  });
});
