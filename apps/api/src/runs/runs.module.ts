import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { RunsGateway } from './runs.gateway';
import { RunsInternalController } from './runs.internal.controller';
import { RunsService } from './runs.service';
import { StatsInternalController } from './stats.internal.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [RunsInternalController, StatsInternalController],
  providers: [RunsService, RunsGateway],
  exports: [RunsService, RunsGateway],
})
export class RunsModule {}
