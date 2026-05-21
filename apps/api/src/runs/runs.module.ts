import { Module } from '@nestjs/common';
import { RunsGateway } from './runs.gateway';
import { RunsInternalController } from './runs.internal.controller';
import { RunsService } from './runs.service';

@Module({
  controllers: [RunsInternalController],
  providers: [RunsService, RunsGateway],
  exports: [RunsService, RunsGateway],
})
export class RunsModule {}
