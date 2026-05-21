import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { UsersService, type UpsertUserInput } from './users.service';

@Controller('internal/users')
@UseGuards(InternalAuthGuard)
export class UsersInternalController {
  constructor(private readonly users: UsersService) {}

  @Post('upsert')
  async upsert(@Body() body: unknown) {
    const input = parseUpsertBody(body);
    const user = await this.users.upsertByGithub(input);
    return {
      id: user.id,
      githubId: user.githubId,
      login: user.login,
      role: user.role,
    };
  }
}

function parseUpsertBody(body: unknown): UpsertUserInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.githubId !== 'number') {
    throw new BadRequestException('githubId must be a number');
  }
  if (typeof b.login !== 'string' || b.login.length === 0) {
    throw new BadRequestException('login must be a non-empty string');
  }
  if (b.email !== undefined && b.email !== null && typeof b.email !== 'string') {
    throw new BadRequestException('email must be a string, null, or undefined');
  }

  return {
    githubId: b.githubId,
    login: b.login,
    email: typeof b.email === 'string' ? b.email : null,
  };
}
