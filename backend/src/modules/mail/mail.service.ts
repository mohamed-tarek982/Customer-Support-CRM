import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EnvService } from '../../config/env';

type Locale = 'en' | 'ar';

const SUBJECT: Record<Locale, string> = {
  en: 'Reset your password',
  ar: 'إعادة تعيين كلمة المرور',
};

/**
 * Minimal transactional mail sender (SCRUM-43).
 *
 * When `SMTP_URL` is set it sends through nodemailer; otherwise — the default in
 * development — it logs the reset link so the flow can be exercised end to end
 * without an SMTP server. A templating engine and richer HTML are a follow-up.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly env: EnvService) {}

  async sendPasswordReset(to: string, rawToken: string, locale: Locale): Promise<void> {
    const link = `${this.env.frontendBase}/reset-password?token=${encodeURIComponent(rawToken)}`;

    if (!this.env.smtpUrl) {
      this.logger.log(`[mail:dev] password reset for ${to} — ${link}`);
      return;
    }

    const transport = nodemailer.createTransport(this.env.smtpUrl);
    await transport.sendMail({
      from: this.env.mailFrom,
      to,
      subject: SUBJECT[locale],
      text: `${SUBJECT[locale]}\n\n${link}\n`,
    });
  }
}
