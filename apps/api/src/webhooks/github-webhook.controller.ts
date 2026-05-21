import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyGithubSignature } from './github-hmac';
import { GithubWebhookService } from './github-webhook.service';

@Controller('webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(private readonly webhooks: GithubWebhookService) {}

  @Post()
  @HttpCode(204)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-github-event') eventType: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('GITHUB_WEBHOOK_SECRET not configured; rejecting all webhooks');
      throw new UnauthorizedException('webhook secret not configured');
    }

    if (!req.rawBody) {
      throw new BadRequestException(
        'raw body unavailable — server must be bootstrapped with { rawBody: true }',
      );
    }

    const ok = verifyGithubSignature({
      rawBody: req.rawBody,
      signatureHeader: signature,
      secret,
    });
    if (!ok) throw new UnauthorizedException('invalid signature');

    if (!eventType) throw new BadRequestException('missing X-GitHub-Event');
    if (!deliveryId) throw new BadRequestException('missing X-GitHub-Delivery');

    // GitHub may send a `ping` event right after webhook registration. Record
    // it but no projection needed.
    await this.webhooks.record({
      deliveryId,
      eventType,
      payload: body,
    });

    return { ok: true };
  }
}
