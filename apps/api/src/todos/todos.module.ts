import { Module } from '@nestjs/common';
import { TodosInternalController } from './todos.internal.controller';
import { TodosService } from './todos.service';

@Module({
  controllers: [TodosInternalController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
