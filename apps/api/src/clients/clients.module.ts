import { Module } from '@nestjs/common';
import { ClientJwtService } from './client-jwt.service';
import { ClientsGateway } from './clients.gateway';
import { ClientsInternalController } from './clients.internal.controller';
import { ClientsPublicController } from './clients.public.controller';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsInternalController, ClientsPublicController],
  providers: [ClientJwtService, ClientsService, ClientsGateway],
  exports: [ClientJwtService, ClientsService],
})
export class ClientsModule {}
