import { Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

export class MasafaSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MasafaSmsProvider.name);
  private jwtToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly senderId: string = '13201',
    private readonly loginUrl: string = 'https://Rasael.almasafa.ly/api/MasafaRasaelLogin',
    private readonly sendUrl: string = 'https://Rasael.almasafa.ly/api/sms/Send',
  ) {}

  /**
   * Formats Libyan phone numbers to 2189XXXXXXXX format
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, ''); // Remove non-digits

    if (cleaned.startsWith('218')) {
      return cleaned;
    }
    if (cleaned.startsWith('0')) {
      return '218' + cleaned.substring(1);
    }
    if (cleaned.length === 9 && (cleaned.startsWith('91') || cleaned.startsWith('92') || cleaned.startsWith('94') || cleaned.startsWith('93'))) {
      return '218' + cleaned;
    }
    return cleaned;
  }

  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    // Cache token if valid (token lifetime according to spec is 360 days)
    if (this.jwtToken && this.tokenExpiresAt && now < this.tokenExpiresAt) {
      return this.jwtToken;
    }

    this.logger.log('Authenticating with Masafa SMS Gateway API...');
    try {
      const response = await fetch(this.loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Masafa login failed with HTTP ${response.status}: ${errText}`);
        throw new Error(`Masafa login HTTP error: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.token) {
        throw new Error('Masafa login response did not contain a token');
      }

      this.jwtToken = data.token;
      // Set expiration buffer to 330 days
      this.tokenExpiresAt = now + 330 * 24 * 60 * 60 * 1000;
      this.logger.log('Successfully acquired JWT token from Masafa SMS Gateway');
      return this.jwtToken!;
    } catch (error) {
      this.logger.error('Failed to authenticate with Masafa SMS Gateway', error);
      throw error;
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      this.logger.error('Cannot send SMS: invalid or empty phone number provided');
      return;
    }

    try {
      let token = await this.getAuthToken();

      const sendPayload = {
        phoneNumber: formattedPhone,
        message,
        senderID: this.senderId,
      };

      let response = await fetch(this.sendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendPayload),
        signal: AbortSignal.timeout(8000),
      });

      // Retry once on 401 Unauthorized
      if (response.status === 401) {
        this.logger.warn('Masafa SMS token expired/unauthorized. Re-authenticating...');
        this.jwtToken = null;
        token = await this.getAuthToken();
        response = await fetch(this.sendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sendPayload),
          signal: AbortSignal.timeout(8000),
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Masafa send SMS HTTP error ${response.status}: ${errText}`);
        throw new Error(`Masafa send SMS HTTP error: ${response.status}`);
      }

      const resData = await response.json();
      this.logger.log(
        `Masafa SMS sent successfully to ${formattedPhone}. TransactionID: ${resData.transactionID || 'N/A'}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send SMS via Masafa to ${formattedPhone}`, error);
      throw error;
    }
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    const message = `رمز التحقق الخاص بك في سبورجو هو: ${code}`;
    await this.sendSms(phoneNumber, message);
  }
}
