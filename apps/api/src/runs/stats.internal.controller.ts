import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { RunsService } from './runs.service';

// Owner-level analytics that aren't scoped to a single run (N6).
//   GET /internal/stats/cost-trend?ownerId=&days=30
@Controller('internal/stats')
@UseGuards(InternalAuthGuard)
export class StatsInternalController {
  constructor(private readonly runs: RunsService) {}

  @Get('cost-trend')
  async costTrend(
    @Query('ownerId') ownerId: string | undefined,
    @Query('days') days: string | undefined,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId query is required');
    const parsed = days ? Number(days) : undefined;
    return this.runs.costTrendByOwner(ownerId, {
      days: Number.isFinite(parsed) ? parsed : undefined,
    });
  }
}
