import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — the process is up. Compose healthchecks use this to decide
   * whether to restart the container.
   */
  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  /**
   * Readiness — the process is up AND its critical dependency (Postgres) is
   * reachable. Use this from external orchestrators to gate traffic.
   */
  @Get('healthz/ready')
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', db: 'reachable' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'db unreachable';
      throw new ServiceUnavailableException({ status: 'degraded', db: msg });
    }
  }
}
