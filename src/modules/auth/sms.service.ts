import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ISmsProvider } from './interfaces/sms-provider.interface';
import { MasafaSmsProvider } from './providers/masafa-sms.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { WhatsappSmsProvider } from './providers/whatsapp-sms.provider';
import { SystemConfig } from '../users/entities/system-config.entity';

// Default active token provided for Al-Masafa SMS Gateway V2 (valid until Nov 2027)
const DEFAULT_MASAFA_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IkJhaGFlZGRlbiBrYWZvIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjoiQWRtaW4iLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3NlcmlhbG51bWJlciI6IjE0OTYiLCJleHAiOjE4MjY5MDIzOTYsImlzcyI6Imh0dHBzOi8vUmFzYWVsLmFsbWFzYWZhLmx5IiwiYXVkIjoiaHR0cHM6Ly9SYXNhZWwuYWxtYXNhZmEubHkifQ.FLABiL662rfY76N6FioJOnHSLwSgmNZl8-hElCLmIQw';

const MASAFA = {
  enabled: 'masafa.enabled',
  token: 'masafa.token',
  username: 'masafa.username',
  password: 'masafa.password',
  senderId: 'masafa.senderId',
} as const;

export interface MasafaSettingsInput {
  enabled?: boolean;
  token?: string;
  username?: string;
  password?: string;
  senderId?: string;
}

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
 * (or if WhatsApp fails) the SMS provider: Masafa when its credentials/token exist, else console.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private provider: ISmsProvider; // SMS provider (Masafa or console)

  constructor(
    private readonly configService: ConfigService,
    @Optional() @InjectRepository(SystemConfig) private readonly configRepo?: Repository<SystemConfig>,
  ) {
    const token = this.configService.get<string>('MASAFA_TOKEN') || DEFAULT_MASAFA_TOKEN;
    const username = this.configService.get<string>('MASAFA_USERNAME');
    const password = this.configService.get<string>('MASAFA_PASSWORD');
    const senderId = this.configService.get<string>('MASAFA_SENDER_ID') || '13201';

    if (token || (username && password)) {
      this.provider = new MasafaSmsProvider(username, password, senderId, token);
      this.logger.log('SMS provider: Masafa (Al-Masafa SMS Gateway V2)');
    } else {
      this.provider = new ConsoleSmsProvider();
      this.logger.warn('SMS provider: console (Masafa credentials not configured)');
    }
  }

  // ---- Masafa SMS Configuration ----
  async getMasafaConfig() {
    const rows = this.configRepo ? await this.configRepo.find({ where: { key: In(Object.values(MASAFA)) } }) : [];
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const env = (k: string) => this.configService.get<string>(k) || '';

    return {
      enabled: db[MASAFA.enabled] !== undefined ? db[MASAFA.enabled] === 'true' : true,
      token: db[MASAFA.token] || env('MASAFA_TOKEN') || DEFAULT_MASAFA_TOKEN,
      username: db[MASAFA.username] || env('MASAFA_USERNAME'),
      password: db[MASAFA.password] || env('MASAFA_PASSWORD'),
      senderId: db[MASAFA.senderId] || env('MASAFA_SENDER_ID') || '13201',
      source: rows.length ? 'admin' : 'env/default',
    };
  }

  async getMasafaSettingsView() {
    const c = await this.getMasafaConfig();
    return {
      enabled: c.enabled,
      senderId: c.senderId,
      username: c.username || '',
      tokenSet: !!c.token,
      tokenHint: c.token ? `••••${c.token.slice(-8)}` : '',
      ready: c.enabled && (!!c.token || (!!c.username && !!c.password)),
      source: c.source,
      gateway: 'Al-Masafa V2 (rasaelV2.almasafa.ly)',
    };
  }

  async saveMasafaSettings(input: MasafaSettingsInput) {
    if (!this.configRepo) throw new BadRequestException('Settings storage unavailable');
    const save = (key: string, value: string) => this.configRepo!.save({ key, value });

    if (input.enabled !== undefined) await save(MASAFA.enabled, String(!!input.enabled));
    if (input.token?.trim()) await save(MASAFA.token, input.token.trim());
    if (input.username !== undefined) await save(MASAFA.username, input.username.trim());
    if (input.password?.trim()) await save(MASAFA.password, input.password.trim());
    if (input.senderId !== undefined) await save(MASAFA.senderId, input.senderId.trim() || '13201');

    return this.getMasafaSettingsView();
  }

  async sendMasafaTest(phoneNumber: string, code: string = '123456') {
    if (!phoneNumber?.trim()) throw new BadRequestException('phoneNumber is required');
    const cfg = await this.getMasafaConfig();
    const provider = new MasafaSmsProvider(
      cfg.username,
      cfg.password,
      cfg.senderId,
      cfg.token,
    );

    try {
      await provider.sendOtp(phoneNumber, code);
      return {
        ok: true,
        phoneNumber,
        code,
        message: 'SMS OTP sent successfully via Masafa Gateway V2',
      };
    } catch (e) {
      throw new BadRequestException(`Masafa SMS API Error: ${(e as Error).message}`);
    }
  }

  // ---- WhatsApp Configuration ----
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

  private async getSmsProvider(): Promise<ISmsProvider> {
    const masafaCfg = await this.getMasafaConfig();
    if (masafaCfg.enabled && (masafaCfg.token || (masafaCfg.username && masafaCfg.password))) {
      return new MasafaSmsProvider(
        masafaCfg.username,
        masafaCfg.password,
        masafaCfg.senderId,
        masafaCfg.token,
      );
    }
    return this.provider;
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
    const smsProvider = await this.getSmsProvider();
    await fn(smsProvider);
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    await this.deliver((p) => p.sendSms(phoneNumber, message));
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.deliver((p) => p.sendOtp(phoneNumber, code));
  }
}
