import { Module } from '@nestjs/common';
import { GithubModule } from './github/github.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, GithubModule, UsersModule, ProjectsModule],
  controllers: [HealthController],
})
export class AppModule {}
