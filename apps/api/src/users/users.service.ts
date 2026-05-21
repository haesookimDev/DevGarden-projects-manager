import { Injectable } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertUserInput {
  githubId: number;
  login: string;
  email?: string | null;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  upsertByGithub(input: UpsertUserInput): Promise<User> {
    return this.prisma.user.upsert({
      where: { githubId: input.githubId },
      create: {
        githubId: input.githubId,
        login: input.login,
        email: input.email ?? null,
        role: input.role,
      },
      update: {
        login: input.login,
        email: input.email ?? null,
      },
    });
  }
}
