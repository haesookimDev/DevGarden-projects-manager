import { Module } from '@nestjs/common';
import { HarnessDryRunService } from './harness-dry-run.service';
import { HarnessTemplatesController } from './harness-templates.controller';
import { HarnessesInternalController } from './harnesses.internal.controller';
import { HarnessesService } from './harnesses.service';

@Module({
  controllers: [HarnessesInternalController, HarnessTemplatesController],
  providers: [HarnessesService, HarnessDryRunService],
  exports: [HarnessesService, HarnessDryRunService],
})
export class HarnessesModule {}
