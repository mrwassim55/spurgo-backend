import { Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

export class ConsoleSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    this.logger.log(`[MOCK SMS SEND] To: ${phoneNumber} | Message: ${message}`);
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    this.logger.log(`[MOCK SMS OTP] To: ${phoneNumber} | Code: ${code}`);
  }
}
