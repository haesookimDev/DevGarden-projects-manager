import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { BudgetService, type UpdateBudgetInput } from './budget.service';

// Per-owner budget settings + current status (N6).
//   GET /internal/owner-budget/:ownerId        → settings
//   PUT /internal/owner-budget/:ownerId        → upsert settings
//   GET /internal/owner-budget/:ownerId/status → spend vs limit + threshold
@Controller('internal/owner-budget')
@UseGuards(InternalAuthGuard)
export class BudgetInternalController {
  constructor(private readonly budget: BudgetService) {}

  @Get(':ownerId')
  async get(@Param('ownerId') ownerId: string) {
    return this.budget.get(ownerId);
  }

  @Get(':ownerId/status')
  async status(@Param('ownerId') ownerId: string) {
    return this.budget.status(ownerId);
  }

  @Put(':ownerId')
  async upsert(@Param('ownerId') ownerId: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const patch: UpdateBudgetInput = {};

    if ('monthlyUsdLimit' in b) {
      const v = b.monthlyUsdLimit;
      if (v === null) patch.monthlyUsdLimit = null;
      else if (typeof v === 'number') patch.monthlyUsdLimit = v;
      else throw new BadRequestException('monthlyUsdLimit must be a number or null');
    }
    if ('warnAt' in b) {
      if (typeof b.warnAt !== 'number') throw new BadRequestException('warnAt must be a number');
      patch.warnAt = b.warnAt;
    }
    if ('resetDay' in b) {
      if (typeof b.resetDay !== 'number') {
        throw new BadRequestException('resetDay must be a number');
      }
      patch.resetDay = b.resetDay;
    }

    return this.budget.upsert(ownerId, patch);
  }
}
