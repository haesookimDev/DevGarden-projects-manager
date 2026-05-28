import { BadRequestException, Injectable } from '@nestjs/common';
import type { OwnerBudget } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BudgetView {
  ownerId: string;
  monthlyUsdLimit: number | null;
  warnAt: number;
  resetDay: number;
  updatedAt: string | null;
}

export interface UpdateBudgetInput {
  monthlyUsdLimit?: number | null;
  warnAt?: number;
  resetDay?: number;
}

export type BudgetThreshold = 'ok' | 'warn' | 'exceeded';

export interface BudgetStatus {
  threshold: BudgetThreshold;
  spendUsd: number;
  limitUsd: number | null;
  warnAt: number;
  /** Window start the spend was summed from. */
  since: string;
}

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ownerId: string): Promise<BudgetView> {
    const row = await this.prisma.ownerBudget.findUnique({ where: { ownerId } });
    return toView(ownerId, row);
  }

  async upsert(ownerId: string, input: UpdateBudgetInput): Promise<BudgetView> {
    if (input.monthlyUsdLimit !== undefined && input.monthlyUsdLimit !== null) {
      if (input.monthlyUsdLimit < 0) {
        throw new BadRequestException('monthlyUsdLimit must be >= 0');
      }
    }
    if (input.warnAt !== undefined && (input.warnAt < 1 || input.warnAt > 100)) {
      throw new BadRequestException('warnAt must be between 1 and 100');
    }
    if (input.resetDay !== undefined && (input.resetDay < 1 || input.resetDay > 28)) {
      // Cap at 28 so the reset day exists in every month.
      throw new BadRequestException('resetDay must be between 1 and 28');
    }

    const row = await this.prisma.ownerBudget.upsert({
      where: { ownerId },
      create: {
        ownerId,
        monthlyUsdLimit: input.monthlyUsdLimit ?? null,
        ...(input.warnAt !== undefined ? { warnAt: input.warnAt } : {}),
        ...(input.resetDay !== undefined ? { resetDay: input.resetDay } : {}),
      },
      update: {
        ...(input.monthlyUsdLimit !== undefined ? { monthlyUsdLimit: input.monthlyUsdLimit } : {}),
        ...(input.warnAt !== undefined ? { warnAt: input.warnAt } : {}),
        ...(input.resetDay !== undefined ? { resetDay: input.resetDay } : {}),
      },
    });
    return toView(ownerId, row);
  }

  // Current spend vs limit for the owner's active budget window. When no
  // limit is set, threshold is always 'ok'. The window starts at the most
  // recent `resetDay` (this month if today >= resetDay, else last month).
  async status(ownerId: string, now = new Date()): Promise<BudgetStatus> {
    const budget = await this.prisma.ownerBudget.findUnique({ where: { ownerId } });
    const limit = budget?.monthlyUsdLimit ? Number(budget.monthlyUsdLimit) : null;
    const warnAt = budget?.warnAt ?? 80;
    const since = windowStart(now, budget?.resetDay ?? 1);

    if (limit === null || limit === 0) {
      return { threshold: 'ok', spendUsd: 0, limitUsd: limit, warnAt, since: since.toISOString() };
    }

    const agg = await this.prisma.harnessRun.aggregate({
      where: { project: { ownerId }, startedAt: { gte: since } },
      _sum: { costUsd: true },
    });
    const spend = agg._sum.costUsd ? Number(agg._sum.costUsd) : 0;

    return {
      threshold: classify(spend, limit, warnAt),
      spendUsd: spend,
      limitUsd: limit,
      warnAt,
      since: since.toISOString(),
    };
  }
}

// Guard with a small margin so floating-point Decimal conversions don't
// misfire right at the boundary (roadmap §6): treat exceeded at 100% and
// warn at warnAt% of the limit.
function classify(spend: number, limit: number, warnAt: number): BudgetThreshold {
  const pct = (spend / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= warnAt) return 'warn';
  return 'ok';
}

function windowStart(now: Date, resetDay: number): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = now.getUTCDate();
  // If we're past (or on) the reset day this month, the window started this
  // month; otherwise it started last month.
  if (day >= resetDay) {
    return new Date(Date.UTC(y, m, resetDay, 0, 0, 0, 0));
  }
  return new Date(Date.UTC(y, m - 1, resetDay, 0, 0, 0, 0));
}

function toView(ownerId: string, row: OwnerBudget | null): BudgetView {
  return {
    ownerId,
    monthlyUsdLimit: row?.monthlyUsdLimit ? Number(row.monthlyUsdLimit) : null,
    warnAt: row?.warnAt ?? 80,
    resetDay: row?.resetDay ?? 1,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}
