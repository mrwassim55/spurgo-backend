import { Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

// Meta WhatsApp Cloud API. OTP uses an approved "authentication" template with a copy-code button.
export class WhatsappSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(WhatsappSmsProvider.name);

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly otpTemplate: string,
    private readonly language = 'ar',
    private readonly apiVersion = 'v21.0',
  ) {}

  private toE164Digits(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.startsWith('0') ? '218' + digits.slice(1) : digits; // local Libyan 09x -> 2189x
  }

  private async send(body: Record<string, any>): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      },
    );
    if (!res.ok) {
      throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
    }
    this.logger.log(`WhatsApp message sent to ${body.to}`);
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.send({
      to: this.toE164Digits(phoneNumber),
      type: 'template',
      template: {
        name: this.otpTemplate,
        language: { code: this.language },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    });
  }

  // Free text only works inside a 24h customer session; SmsService falls back to SMS otherwise.
  async sendSms(phoneNumber: string, message: string): Promise<void> {
    await this.send({ to: this.toE164Digits(phoneNumber), type: 'text', text: { body: message } });
  }
}
