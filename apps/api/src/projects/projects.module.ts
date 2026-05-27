import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { PresetsInternalController } from './presets.internal.controller';
import { PresetsService } from './presets.service';
import { ProjectsInternalController } from './projects.internal.controller';
import { ProjectsSidecarController } from './projects.sidecar.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ClientsModule],
  controllers: [ProjectsInternalController, ProjectsSidecarController, PresetsInternalController],
  providers: [ProjectsService, PresetsService],
  exports: [ProjectsService, PresetsService],
})
export class ProjectsModule {}
