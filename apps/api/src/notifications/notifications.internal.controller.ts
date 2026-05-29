import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { type Observable, merge, interval, map } from 'rxjs';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import {
  NotificationService,
  type NotificationView,
  type TriggerMap,
  type UpdateNotificationSettingsInput,
} from './notifications.service';

// Per-user notification settings + inbox (N5).
//   GET  /internal/users/:id/notification-settings  → settings
//   PUT  /internal/users/:id/notification-settings  → upsert
//   GET  /internal/users/:id/notifications          → web-toast inbox
//   POST /internal/users/:id/notifications/test     → deliver a test toast
@Controller('internal/users')
@UseGuards(InternalAuthGuard)
export class NotificationsInternalController {
  constructor(private readonly notifications: NotificationService) {}

  @Get(':id/notification-settings')
  async getSettings(@Param('id') id: string) {
    return this.notifications.getSettings(id);
  }

  @Put(':id/notification-settings')
  async putSettings(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const patch: UpdateNotificationSettingsInput = {};

    if ('webToast' in b) {
      if (typeof b.webToast !== 'boolean')
        throw new BadRequestException('webToast must be a boolean');
      patch.webToast = b.webToast;
    }
    if ('slackWebhookUrl' in b) {
      const v = b.slackWebhookUrl;
      if (v !== null && typeof v !== 'string') {
        throw new BadRequestException('slackWebhookUrl must be a string or null');
      }
      patch.slackWebhookUrl = v;
    }
    if ('emailEnabled' in b) {
      if (typeof b.emailEnabled !== 'boolean') {
        throw new BadRequestException('emailEnabled must be a boolean');
      }
      patch.emailEnabled = b.emailEnabled;
    }
    if ('emailAddress' in b) {
      const v = b.emailAddress;
      if (v !== null && typeof v !== 'string') {
        throw new BadRequestException('emailAddress must be a string or null');
      }
      patch.emailAddress = v;
    }
    if ('triggers' in b) {
      patch.triggers = parseTriggerPatch(b.triggers, 'triggers');
    }
    if ('perProject' in b) {
      if (!b.perProject || typeof b.perProject !== 'object' || Array.isArray(b.perProject)) {
        throw new BadRequestException('perProject must be an object');
      }
      const out: Record<string, Partial<TriggerMap>> = {};
      for (const [projectId, overrides] of Object.entries(
        b.perProject as Record<string, unknown>,
      )) {
        out[projectId] = parseTriggerPatch(overrides, `perProject.${projectId}`);
      }
      patch.perProject = out;
    }

    return this.notifications.upsertSettings(id, patch);
  }

  @Get(':id/notifications')
  async list(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Query('unreadOnly') unreadOnly: string | undefined,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.notifications.listNotifications(id, {
      limit: Number.isFinite(parsed) ? parsed : undefined,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
  }

  @Post(':id/notifications/test')
  async test(@Param('id') id: string) {
    return this.notifications.sendTest(id);
  }

  // Live notification stream (SSE). The web BFF proxies this with the internal
  // secret; the browser connects to the BFF via EventSource. A 15s ping keeps
  // intermediaries from dropping an idle connection (clients ignore it).
  @Sse(':id/notifications/stream')
  stream(@Param('id') id: string): Observable<{ data: NotificationView | { kind: 'ping' } }> {
    const events = this.notifications.streamFor(id).pipe(map((n) => ({ data: n })));
    const ping = interval(15_000).pipe(map(() => ({ data: { kind: 'ping' as const } })));
    return merge(events, ping);
  }
}

function parseTriggerPatch(value: unknown, label: string): Partial<TriggerMap> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an object`);
  }
  const v = value as Record<string, unknown>;
  const out: Partial<TriggerMap> = {};
  for (const k of ['success', 'failed', 'cancelled'] as const) {
    if (k in v) {
      if (typeof v[k] !== 'boolean')
        throw new BadRequestException(`${label}.${k} must be a boolean`);
      out[k] = v[k] as boolean;
    }
  }
  return out;
}
