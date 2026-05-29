import { Module } from '@nestjs/common';
import { NotificationsInternalController } from './notifications.internal.controller';
import { NotificationService } from './notifications.service';

@Module({
  controllers: [NotificationsInternalController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
