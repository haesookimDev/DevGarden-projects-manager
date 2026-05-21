import { Module } from '@nestjs/common';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService],
  exports: [GithubWebhookService],
})
export class WebhooksModule {}
