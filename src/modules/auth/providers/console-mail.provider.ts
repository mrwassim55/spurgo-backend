import { Logger } from '@nestjs/common';
import { IMailProvider } from '../interfaces/mail-provider.interface';

export class ConsoleMailProvider implements IMailProvider {
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async sendOtp(to: string, code: string): Promise<void> {
    this.logger.log(`[MAIL MOCK - ConsoleMailProvider] Sending OTP ${code} to ${to}`);
  }

  async sendPasswordReset(to: string, code: string): Promise<void> {
    this.logger.log(`[MAIL MOCK - ConsoleMailProvider] Sending Password Reset OTP ${code} to ${to}`);
  }
}
