import { Injectable, Logger } from '@nestjs/common';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;
const BACKOFF_MS = 100;

/**
 * Posts a notification to a Slack incoming webhook (N5). Each attempt is bounded
 * by a 5s timeout; transient failures (network / non-2xx) are retried up to 3
 * times with linear backoff. Never throws — returns whether delivery succeeded.
 */
@Injectable()
export class SlackWebhookChannel {
  private readonly logger = new Logger(SlackWebhookChannel.name);

  async send(webhookUrl: string, message: { text: string }): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(message),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return true;
        this.logger.warn(
          `slack webhook returned ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
      } catch (err) {
        clearTimeout(timer);
        this.logger.warn(
          `slack webhook attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (attempt < MAX_ATTEMPTS) await delay(BACKOFF_MS * attempt);
    }
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
