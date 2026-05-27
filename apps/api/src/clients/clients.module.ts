import { Module } from '@nestjs/common';
import { ClientJwtService } from './client-jwt.service';
import { ClientsGateway } from './clients.gateway';
import { ClientsInternalController } from './clients.internal.controller';
import { ClientsPublicController } from './clients.public.controller';
import { ClientsService } from './clients.service';
import { ClientsSidecarController } from './clients.sidecar.controller';

@Module({
  controllers: [ClientsInternalController, ClientsPublicController, ClientsSidecarController],
  providers: [ClientJwtService, ClientsService, ClientsGateway],
  exports: [ClientJwtService, ClientsService, ClientsGateway],
})
export class ClientsModule {}
