import { Module } from '@nestjs/common';
import { NotificationsInternalController } from './notifications.internal.controller';
import { NotificationService } from './notifications.service';
import { SlackWebhookChannel } from './slack-webhook.channel';

@Module({
  controllers: [NotificationsInternalController],
  providers: [NotificationService, SlackWebhookChannel],
  exports: [NotificationService],
})
export class NotificationsModule {}
