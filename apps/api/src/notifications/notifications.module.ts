import { Module } from '@nestjs/common';
import { EmailChannel, MAIL_TRANSPORT, buildSmtpTransport } from './email.channel';
import { NotificationsInternalController } from './notifications.internal.controller';
import { NotificationService } from './notifications.service';
import { SlackWebhookChannel } from './slack-webhook.channel';

@Module({
  controllers: [NotificationsInternalController],
  providers: [
    NotificationService,
    SlackWebhookChannel,
    EmailChannel,
    { provide: MAIL_TRANSPORT, useFactory: buildSmtpTransport },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
