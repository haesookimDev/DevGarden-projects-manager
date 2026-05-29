import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationService } from '../notifications/notifications.service';
import { BUDGET_NOTIFIER, BudgetMonitorService } from './budget-monitor.service';
import { BudgetInternalController } from './budget.internal.controller';
import { BudgetService } from './budget.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BudgetInternalController],
  providers: [
    BudgetService,
    BudgetMonitorService,
    // N5: budget warn/exceeded crossings fan out through NotificationService.
    { provide: BUDGET_NOTIFIER, useExisting: NotificationService },
  ],
  exports: [BudgetService, BudgetMonitorService],
})
export class BudgetModule {}
