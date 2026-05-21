import { Module } from '@nestjs/common';
import { RunsInternalController } from './runs.internal.controller';
import { RunsService } from './runs.service';

@Module({
  controllers: [RunsInternalController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
