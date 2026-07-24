import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailMessage { to: string; subject: string; text: string; html?: string }

@Injectable()
export class OutlookEmailService {
  private transporter?: Transporter;

  async send(message: EmailMessage): Promise<{ id: string }> {
    this.assertConfigured();
    const result = await this.transport().sendMail({
      from: { name: process.env.SMTP_FROM_NAME ?? 'goVerifEye', address: process.env.SMTP_FROM_EMAIL! },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { id: result.messageId };
  }

  private transport() {
    const secure = process.env.SMTP_SECURE?.toLowerCase() === 'true';
    this.transporter ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.office365.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure,
      requireTLS: !secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    return this.transporter;
  }

  private assertConfigured() {
    const keys = ['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
    if (keys.some((key) => !process.env[key] || process.env[key]!.startsWith('replace-'))) {
      throw new ServiceUnavailableException('Outlook SMTP is not configured');
    }
  }
}
