import { Module } from '@nestjs/common';
import { ClientsModule } from './clients/clients.module';
import { GithubModule } from './github/github.module';
import { HarnessesModule } from './harnesses/harnesses.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RunsModule } from './runs/runs.module';
import { TodosModule } from './todos/todos.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    PrismaModule,
    GithubModule,
    UsersModule,
    ProjectsModule,
    ClientsModule,
    HarnessesModule,
    RunsModule,
    TodosModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
