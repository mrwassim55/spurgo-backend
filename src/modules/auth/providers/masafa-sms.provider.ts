import { Logger } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

export interface MasafaSendResult {
  transactionId: string;
  status: string;
  phoneNo?: string;
}

export class MasafaSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MasafaSmsProvider.name);
  private jwtToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly username?: string,
    private readonly password?: string,
    private readonly senderId: string = '13201',
    initialToken?: string,
    private readonly loginUrl: string = 'https://rasaelV2.almasafa.ly/api/Token',
    private readonly sendUrl: string = 'https://rasaelV2.almasafa.ly/api/sms/send',
    private readonly fallbackSendUrl: string = 'https://Rasael.almasafa.ly/api/sms/send',
    private readonly fallbackLoginUrl: string = 'https://Rasael.almasafa.ly/api/MasafaRasaelLogin',
  ) {
    if (initialToken) {
      this.jwtToken = initialToken;
      try {
        const parts = initialToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.exp) {
            this.tokenExpiresAt = payload.exp * 1000;
          }
        }
      } catch {
        this.tokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      }
    }
  }

  /**
   * Formats Libyan phone numbers to 2189XXXXXXXX format
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, ''); // Remove non-digits

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
    // Cache token if still valid (with 5-minute safety buffer)
    if (this.jwtToken && (!this.tokenExpiresAt || now < this.tokenExpiresAt - 300000)) {
      return this.jwtToken;
    }

    if (!this.username || !this.password) {
      if (this.jwtToken) {
        return this.jwtToken;
      }
      throw new Error('Masafa SMS credentials or active token required');
    }

    this.logger.log('Authenticating with Masafa SMS Gateway API V2...');
    try {
      // 1. Try V2 Token endpoint
      let response = await fetch(this.loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        signal: AbortSignal.timeout(8000),
      });

      // If V2 fails, try fallback V1 login endpoint
      if (!response.ok && this.fallbackLoginUrl) {
        this.logger.warn(`Masafa V2 login returned HTTP ${response.status}. Trying fallback login...`);
        response = await fetch(this.fallbackLoginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.username,
            password: this.password,
          }),
          signal: AbortSignal.timeout(8000),
        });
      }

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
      if (this.jwtToken) {
        try {
          const parts = this.jwtToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            if (payload.exp) {
              this.tokenExpiresAt = payload.exp * 1000;
            }
          }
        } catch {
          this.tokenExpiresAt = now + 330 * 24 * 60 * 60 * 1000;
        }
      }

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
      throw new Error('Invalid phone number');
    }

    try {
      let token = await this.getAuthToken();
      const clientRequestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const sendPayload = {
        phoneNumber: formattedPhone,
        message,
        clientRequestId,
        ttl: 180,
        senderID: this.senderId,
      };

      let usedUrl = this.sendUrl;
      let response: Response | null = null;

      try {
        response = await fetch(this.sendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sendPayload),
          signal: AbortSignal.timeout(8000),
        });
      } catch (err) {
        this.logger.warn(`Primary send URL ${this.sendUrl} failed network call: ${(err as Error).message}`);
      }

      // If unauthorized or token invalid on primary URL, try re-authenticating if username/password exist
      if (response && response.status === 401 && this.username && this.password) {
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

      // If primary URL failed (e.g. 401 invalid_token / 404 / 500), automatically try fallback URL
      if (!response || !response.ok) {
        this.logger.warn(`Primary Masafa send (${this.sendUrl}) returned HTTP ${response?.status}. Attempting fallback (${this.fallbackSendUrl})...`);
        usedUrl = this.fallbackSendUrl;
        response = await fetch(this.fallbackSendUrl, {
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
        this.logger.error(`Masafa send SMS HTTP error ${response.status} at ${usedUrl}: ${errText}`);
        throw new Error(`Masafa send SMS HTTP error: ${response.status}`);
      }

      const resData = await response.json();
      const transactionId = resData.transactionID || resData.transactionId || clientRequestId;
      this.logger.log(
        `Masafa SMS sent successfully to ${formattedPhone} via ${usedUrl}. TransactionID: ${transactionId}`,
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

  async checkStatus(transactionId: string): Promise<any> {
    const token = await this.getAuthToken();
    try {
      const res = await fetch(`https://rasaelV2.almasafa.ly/api/sms/status/${transactionId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return await res.json();
    } catch {}

    const fallbackRes = await fetch(`https://Rasael.almasafa.ly/api/sms/status/${transactionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    return fallbackRes.json();
  }

  async getBalance(): Promise<any> {
    const token = await this.getAuthToken();
    const res = await fetch('https://rasaelV2.almasafa.ly/api/sms/Balance', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cmd: 'balance' }),
      signal: AbortSignal.timeout(8000),
    });
    return res.json();
  }
}
