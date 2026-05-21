import { Module } from '@nestjs/common';
import { HarnessesInternalController } from './harnesses.internal.controller';
import { HarnessesService } from './harnesses.service';

@Module({
  controllers: [HarnessesInternalController],
  providers: [HarnessesService],
  exports: [HarnessesService],
})
export class HarnessesModule {}
