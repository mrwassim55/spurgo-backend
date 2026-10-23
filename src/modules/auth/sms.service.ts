import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsProvider } from './interfaces/sms-provider.interface';
import { MasafaSmsProvider } from './providers/masafa-sms.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private provider: ISmsProvider;

  constructor(private readonly configService: ConfigService) {
    const providerType = this.configService.get<string>('SMS_PROVIDER', 'masafa');
    const username = this.configService.get<string>('MASAFA_USERNAME');
    const password = this.configService.get<string>('MASAFA_PASSWORD');
    const senderId = this.configService.get<string>('MASAFA_SENDER_ID') || '13201';

    if (providerType === 'masafa' && username && password) {
      this.provider = new MasafaSmsProvider(username, password, senderId);
      this.logger.log('SmsService initialized with Masafa SMS Gateway Provider');
    } else {
      this.provider = new ConsoleSmsProvider();
      if (providerType === 'masafa') {
        this.logger.warn(
          'Masafa credentials (MASAFA_USERNAME, MASAFA_PASSWORD) are not fully configured. SmsService initialized with Mock Console Provider.',
        );
      } else {
        this.logger.log('SmsService initialized with Mock Console Provider');
      }
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    await this.provider.sendSms(phoneNumber, message);
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.provider.sendOtp(phoneNumber, code);
  }
}
