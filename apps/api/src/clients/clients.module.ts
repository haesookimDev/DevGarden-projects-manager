import { Module } from '@nestjs/common';
import { ClientJwtService } from './client-jwt.service';
import { ClientsInternalController } from './clients.internal.controller';
import { ClientsPublicController } from './clients.public.controller';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsInternalController, ClientsPublicController],
  providers: [ClientJwtService, ClientsService],
  exports: [ClientJwtService, ClientsService],
})
export class ClientsModule {}
