import { Module } from '@nestjs/common';
import { HarnessDryRunService } from './harness-dry-run.service';
import { HarnessesInternalController } from './harnesses.internal.controller';
import { HarnessesService } from './harnesses.service';

@Module({
  controllers: [HarnessesInternalController],
  providers: [HarnessesService, HarnessDryRunService],
  exports: [HarnessesService, HarnessDryRunService],
})
export class HarnessesModule {}
