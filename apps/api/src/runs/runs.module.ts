import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { RunsGateway } from './runs.gateway';
import { RunsInternalController } from './runs.internal.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [ProjectsModule],
  controllers: [RunsInternalController],
  providers: [RunsService, RunsGateway],
  exports: [RunsService, RunsGateway],
})
export class RunsModule {}
