import { Module } from '@nestjs/common';
import { PresetsService } from './presets.service';
import { ProjectsInternalController } from './projects.internal.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsInternalController],
  providers: [ProjectsService, PresetsService],
  exports: [ProjectsService, PresetsService],
})
export class ProjectsModule {}
