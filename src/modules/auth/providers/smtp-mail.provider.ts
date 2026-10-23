import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { IMailProvider } from '../interfaces/mail-provider.interface';

export class SmtpMailProvider implements IMailProvider {
  private readonly logger = new Logger(SmtpMailProvider.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly user: string,
    private readonly pass: string,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const subject = 'Your Spurgo Verification Code';
    const text = `Your verification code is: ${code}. It will expire in 5 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #FF7A00; text-align: center;">Spurgo Verification Code</h2>
        <p>Hello,</p>
        <p>Thank you for registering on Spurgo. Please use the following One-Time Password (OTP) to verify your email address:</p>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; border-radius: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes. If you did not request this code, please ignore this email.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`SMTP OTP email sent successfully to ${to}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP OTP email send failed to ${to}: ${errMsg}`);
      throw new Error(`SMTP Mail send failed: ${errMsg}`);
    }
  }

  async sendPasswordReset(to: string, code: string): Promise<void> {
    const subject = 'Spurgo Password Reset Code';
    const text = `Your password reset code is: ${code}. It will expire in 5 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #FF7A00; text-align: center;">Spurgo Password Reset</h2>
        <p>Hello,</p>
        <p>You requested a password reset on Spurgo. Please use the following One-Time Password (OTP) code to verify your request:</p>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; border-radius: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`SMTP Password reset email sent successfully to ${to}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP Password reset email send failed to ${to}: ${errMsg}`);
      throw new Error(`SMTP Mail send failed: ${errMsg}`);
    }
  }
}
