import { Logger } from '@nestjs/common';
import { IMailProvider } from '../interfaces/mail-provider.interface';

export class BrevoApiMailProvider implements IMailProvider {
  private readonly logger = new Logger(BrevoApiMailProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly templateId: number,
    private readonly fromAddress: string,
  ) {}

  private getSender() {
    const match = this.fromAddress.match(/(?:"?([^"]*)"?\s)?(?:<([^>]+)>)/);
    if (match) {
      return {
        name: match[1] || 'Spurgo',
        email: match[2],
      };
    }
    return {
      name: 'Spurgo',
      email: this.fromAddress,
    };
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const url = 'https://api.brevo.com/v3/smtp/email';
    const body = {
      templateId: this.templateId,
      to: [{ email: to }],
      params: {
        otp: code,
      },
      tags: ['otp'],
    };

    try {
      this.logger.log(`Sending API transactional email to ${to} using Template ID ${this.templateId}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data?.message || JSON.stringify(data);
        this.logger.error(`Brevo API returned error: ${response.status} - ${errorMsg}`);
        throw new Error(`Brevo API Error: ${errorMsg}`);
      }

      this.logger.log(`Brevo API transactional email sent successfully. Message ID: ${data?.messageId}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email via Brevo API to ${to}: ${errMsg}`);
      throw new Error(`Brevo API Mail send failed: ${errMsg}`);
    }
  }

  async sendPasswordReset(to: string, code: string): Promise<void> {
    const url = 'https://api.brevo.com/v3/smtp/email';
    const sender = this.getSender();
    const body = {
      sender,
      to: [{ email: to }],
      subject: 'Spurgo Password Reset Code',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #FF7A00; text-align: center;">Spurgo Password Reset</h2>
          <p>Hello,</p>
          <p>You requested a password reset on Spurgo. Please use the following One-Time Password (OTP) code to verify your request:</p>
          <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; border-radius: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
      tags: ['password-reset'],
    };

    try {
      this.logger.log(`Sending API transactional password reset email to ${to}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data?.message || JSON.stringify(data);
        this.logger.error(`Brevo API returned error: ${response.status} - ${errorMsg}`);
        throw new Error(`Brevo API Error: ${errorMsg}`);
      }

      this.logger.log(`Brevo API transactional password reset email sent successfully. Message ID: ${data?.messageId}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send password reset via Brevo API to ${to}: ${errMsg}`);
      throw new Error(`Brevo API Mail send failed: ${errMsg}`);
    }
  }
}
