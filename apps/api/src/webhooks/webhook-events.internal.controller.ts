import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { WebhookEventsService } from './webhook-events.service';

// Observability surface over the GithubEvent audit table (N6).
//   GET  /internal/github/events            — filtered listing
//   GET  /internal/github/events/:id        — single event incl. payload
//   POST /internal/github/events/:id/redeliver — ask GitHub to redeliver
@Controller('internal/github/events')
@UseGuards(InternalAuthGuard)
export class WebhookEventsInternalController {
  constructor(private readonly events: WebhookEventsService) {}

  @Get()
  async list(
    @Query('projectId') projectId: string | undefined,
    @Query('type') type: string | undefined,
    @Query('since') since: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    return this.events.listEvents({
      ...(projectId ? { projectId } : {}),
      ...(type ? { eventType: type } : {}),
      ...(since ? { since: parseDate(since) } : {}),
      ...(pageSize ? { pageSize: parsePositiveInt(pageSize) } : {}),
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const e = await this.events.getEvent(id);
    return {
      id: e.id,
      deliveryId: e.deliveryId,
      eventType: e.eventType,
      action: e.action,
      repoFullName: e.repoFullName,
      projectId: e.projectId,
      receivedAt: e.receivedAt.toISOString(),
      payload: e.payload,
    };
  }

  @Post(':id/redeliver')
  @HttpCode(200)
  async redeliver(@Param('id') id: string) {
    return this.events.redeliver(id);
  }
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('since must be an ISO date string');
  return d;
}

function parsePositiveInt(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException('pageSize must be a positive integer');
  }
  return n;
}
