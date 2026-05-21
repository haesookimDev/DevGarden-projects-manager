import { Module } from '@nestjs/common';
import { ClientsModule } from './clients/clients.module';
import { GithubModule } from './github/github.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, GithubModule, UsersModule, ProjectsModule, ClientsModule],
  controllers: [HealthController],
})
export class AppModule {}
