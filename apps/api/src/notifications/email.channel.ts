import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

// Minimal transport surface the EmailChannel needs — nodemailer's Transporter
// satisfies it structurally, and tests can supply a stub.
export interface MailTransport {
  sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

// Build an SMTP transport from SMTP_* env, or null when SMTP_HOST is unset
// (email channel disabled). Bound to MAIL_TRANSPORT in NotificationsModule.
export function buildSmtpTransport(): MailTransport | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return createTransport({
    host,
    port,
    secure: port === 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

/**
 * Sends a plain-text notification email over a configured SMTP relay (N5).
 * No-op (returns false) when SMTP is unconfigured. Never throws — delivery
 * failures must not break the run lifecycle.
 */
@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly from = process.env.SMTP_FROM ?? 'DevGarden <no-reply@devgarden.local>';

  constructor(
    @Optional() @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  get configured(): boolean {
    return !!this.transport;
  }

  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (err) {
      this.logger.warn(
        `email send to ${to} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
