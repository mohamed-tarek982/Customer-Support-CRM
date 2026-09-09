import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Wraps the transactional mail sender so `AuthModule` can depend on an interface
 * rather than nodemailer directly. Production SMTP wiring is a follow-up.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
