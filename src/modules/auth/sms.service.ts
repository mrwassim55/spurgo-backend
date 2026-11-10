import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ISmsProvider } from './interfaces/sms-provider.interface';
import { MasafaSmsProvider } from './providers/masafa-sms.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { WhatsappSmsProvider } from './providers/whatsapp-sms.provider';
import { SystemConfig } from '../users/entities/system-config.entity';

// WhatsApp Cloud API settings, editable from the admin dashboard (SystemConfig), env vars as fallback.
const WA = {
  enabled: 'whatsapp.enabled',
  token: 'whatsapp.token',
  phoneNumberId: 'whatsapp.phoneNumberId',
  template: 'whatsapp.template',
  lang: 'whatsapp.lang',
} as const;

export interface WhatsappSettingsInput {
  enabled?: boolean;
  token?: string;
  phoneNumberId?: string;
  template?: string;
  lang?: string;
}

/**
 * OTP/SMS delivery: WhatsApp first when it's enabled and fully configured, otherwise
 * (or if WhatsApp fails) the SMS provider: Masafa when its credentials exist, else console.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private provider: ISmsProvider; // SMS provider (Masafa or console)

  constructor(
    private readonly configService: ConfigService,
    @Optional() @InjectRepository(SystemConfig) private readonly configRepo?: Repository<SystemConfig>,
  ) {
    const username = this.configService.get<string>('MASAFA_USERNAME');
    const password = this.configService.get<string>('MASAFA_PASSWORD');
    const senderId = this.configService.get<string>('MASAFA_SENDER_ID') || '13201';
    if (username && password) {
      this.provider = new MasafaSmsProvider(username, password, senderId);
      this.logger.log('SMS provider: Masafa');
    } else {
      this.provider = new ConsoleSmsProvider();
      this.logger.warn('SMS provider: console (Masafa credentials not configured)');
    }
  }

  async getWhatsappConfig() {
    const rows = this.configRepo ? await this.configRepo.find({ where: { key: In(Object.values(WA)) } }) : [];
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const env = (k: string) => this.configService.get<string>(k) || '';
    return {
      enabled: db[WA.enabled] !== undefined ? db[WA.enabled] === 'true' : env('SMS_PROVIDER') === 'whatsapp',
      token: db[WA.token] || env('WHATSAPP_TOKEN'),
      phoneNumberId: db[WA.phoneNumberId] || env('WHATSAPP_PHONE_NUMBER_ID'),
      template: db[WA.template] || env('WHATSAPP_OTP_TEMPLATE'),
      lang: db[WA.lang] || env('WHATSAPP_OTP_LANG') || 'ar',
      source: rows.length ? 'admin' : 'env',
    };
  }

  // What the admin page sees: never the token itself.
  async getWhatsappSettingsView() {
    const c = await this.getWhatsappConfig();
    return {
      enabled: c.enabled,
      phoneNumberId: c.phoneNumberId,
      template: c.template,
      lang: c.lang,
      tokenSet: !!c.token,
      tokenHint: c.token ? `••••${c.token.slice(-4)}` : '',
      ready: c.enabled && !!(c.token && c.phoneNumberId && c.template),
      source: c.source,
      fallback: this.provider instanceof MasafaSmsProvider ? 'masafa' : 'console',
    };
  }

  async saveWhatsappSettings(input: WhatsappSettingsInput) {
    if (!this.configRepo) throw new BadRequestException('Settings storage unavailable');
    const save = (key: string, value: string) => this.configRepo!.save({ key, value });
    if (input.enabled !== undefined) await save(WA.enabled, String(!!input.enabled));
    // Empty token = keep the stored one (the page never receives it back).
    if (input.token?.trim()) await save(WA.token, input.token.trim());
    if (input.phoneNumberId !== undefined) await save(WA.phoneNumberId, input.phoneNumberId.trim());
    if (input.template !== undefined) await save(WA.template, input.template.trim());
    if (input.lang !== undefined) await save(WA.lang, input.lang.trim() || 'ar');
    return this.getWhatsappSettingsView();
  }

  async sendWhatsappTest(phoneNumber: string) {
    if (!phoneNumber?.trim()) throw new BadRequestException('phoneNumber is required');
    const wa = await this.whatsapp();
    if (!wa) throw new BadRequestException('WhatsApp is disabled or missing token / phone number ID / template');
    try {
      await wa.sendOtp(phoneNumber, '123456');
      return { ok: true };
    } catch (e) {
      throw new BadRequestException(`WhatsApp API: ${(e as Error).message}`);
    }
  }

  private async whatsapp(): Promise<WhatsappSmsProvider | null> {
    const c = await this.getWhatsappConfig();
    return c.enabled && c.token && c.phoneNumberId && c.template
      ? new WhatsappSmsProvider(c.token, c.phoneNumberId, c.template, c.lang)
      : null;
  }

  private async deliver(fn: (p: ISmsProvider) => Promise<void>): Promise<void> {
    const wa = await this.whatsapp();
    if (wa) {
      try {
        return await fn(wa);
      } catch (e) {
        this.logger.warn(`WhatsApp send failed, falling back to SMS: ${(e as Error).message}`);
      }
    }
    await fn(this.provider);
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    await this.deliver((p) => p.sendSms(phoneNumber, message));
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.deliver((p) => p.sendOtp(phoneNumber, code));
  }
}
