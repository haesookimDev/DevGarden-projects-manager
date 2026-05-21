import { Module } from '@nestjs/common';
import { ProjectsInternalController } from './projects.internal.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsInternalController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
