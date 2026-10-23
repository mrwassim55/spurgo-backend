import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMailProvider } from './interfaces/mail-provider.interface';
import { BrevoApiMailProvider } from './providers/brevo-api-mail.provider';
import { SmtpMailProvider } from './providers/smtp-mail.provider';
import { ConsoleMailProvider } from './providers/console-mail.provider';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private provider: IMailProvider;
  private isEmailOtpEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const enableEmailOtpStr = this.configService.get<string>('ENABLE_EMAIL_OTP');
    // Defaults to false so email OTP is deactivated until explicitly enabled
    this.isEmailOtpEnabled = enableEmailOtpStr === 'true';

    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const templateIdStr = this.configService.get<string>('BREVO_TEMPLATE_ID');
    const templateId = templateIdStr ? parseInt(templateIdStr, 10) : 1;

    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM') || '"Spurgo" <noreply@spurgo.com>';

    if (apiKey) {
      this.provider = new BrevoApiMailProvider(apiKey, templateId, from);
      this.logger.log(
        `MailService initialized with Brevo HTTP API Provider (Email OTP status: ${
          this.isEmailOtpEnabled ? 'ENABLED' : 'DEACTIVATED'
        })`,
      );
    } else if (host && port && user && pass) {
      this.provider = new SmtpMailProvider(host, parseInt(port, 10), user, pass, from);
      this.logger.log(
        `MailService initialized with SMTP Provider (Email OTP status: ${
          this.isEmailOtpEnabled ? 'ENABLED' : 'DEACTIVATED'
        })`,
      );
    } else {
      this.provider = new ConsoleMailProvider();
      this.logger.warn(
        'SMTP/API environment variables are not fully configured. MailService initialized with Mock Console Provider.',
      );
    }
  }

  async sendOtp(to: string, code: string): Promise<void> {
    if (!this.isEmailOtpEnabled) {
      this.logger.log(
        `Email OTP is currently deactivated (ENABLE_EMAIL_OTP=false). Skipping email dispatch to ${to}`,
      );
      return;
    }
    await this.provider.sendOtp(to, code);
  }

  async sendPasswordReset(to: string, code: string): Promise<void> {
    if (!this.isEmailOtpEnabled) {
      this.logger.log(
        `Email OTP is currently deactivated (ENABLE_EMAIL_OTP=false). Skipping password reset email dispatch to ${to}`,
      );
      return;
    }
    await this.provider.sendPasswordReset(to, code);
  }
}
