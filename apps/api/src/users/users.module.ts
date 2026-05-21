import { Module } from '@nestjs/common';
import { UsersInternalController } from './users.internal.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersInternalController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
