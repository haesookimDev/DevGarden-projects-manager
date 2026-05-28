import { Module } from '@nestjs/common';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { WebhookEventsInternalController } from './webhook-events.internal.controller';
import { WebhookEventsService } from './webhook-events.service';

@Module({
  controllers: [GithubWebhookController, WebhookEventsInternalController],
  providers: [GithubWebhookService, WebhookEventsService],
  exports: [GithubWebhookService, WebhookEventsService],
})
export class WebhooksModule {}
