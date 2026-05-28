import { Module } from '@nestjs/common';
import { BudgetMonitorService } from './budget-monitor.service';
import { BudgetInternalController } from './budget.internal.controller';
import { BudgetService } from './budget.service';

@Module({
  controllers: [BudgetInternalController],
  providers: [BudgetService, BudgetMonitorService],
  exports: [BudgetService, BudgetMonitorService],
})
export class BudgetModule {}
