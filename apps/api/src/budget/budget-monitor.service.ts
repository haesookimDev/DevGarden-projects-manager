import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { BudgetService, type BudgetStatus } from './budget.service';

// Seam for N5's NotificationService. Until N5 lands, the default
// implementation just logs; once N5 exists it provides a binding for
// BUDGET_NOTIFIER that fans out to web toast / Slack / email.
export const BUDGET_NOTIFIER = Symbol('BUDGET_NOTIFIER');

export interface BudgetNotifier {
  notify(event: {
    ownerId: string;
    kind: 'budget-warn' | 'budget-exceeded';
    status: BudgetStatus;
  }): Promise<void> | void;
}

@Injectable()
export class BudgetMonitorService {
  private readonly logger = new Logger(BudgetMonitorService.name);

  constructor(
    private readonly budget: BudgetService,
    @Optional() @Inject(BUDGET_NOTIFIER) private readonly notifier?: BudgetNotifier,
  ) {}

  // Called after a terminal run for the owner. Computes the current budget
  // status and, on warn / exceeded, fans out through the notifier (or logs
  // when none is wired). Never throws — budget alerting must not break the
  // run lifecycle.
  async checkAfterRun(ownerId: string): Promise<BudgetStatus | null> {
    try {
      const status = await this.budget.status(ownerId);
      if (status.threshold === 'ok') return status;

      const kind = status.threshold === 'exceeded' ? 'budget-exceeded' : 'budget-warn';
      if (this.notifier) {
        await this.notifier.notify({ ownerId, kind, status });
      } else {
        this.logger.warn(
          `[${kind}] owner ${ownerId} spend $${status.spendUsd.toFixed(2)} / $${status.limitUsd?.toFixed(2)} (warnAt ${status.warnAt}%) — no notifier wired (N5)`,
        );
      }
      return status;
    } catch (err) {
      this.logger.error(
        `budget check failed for owner ${ownerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
