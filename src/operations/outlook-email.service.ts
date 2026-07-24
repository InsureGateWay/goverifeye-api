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
      from: { name: process.env.OUTLOOK_FROM_NAME ?? 'goVerifEye', address: process.env.OUTLOOK_FROM_EMAIL! },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { id: result.messageId };
  }

  private transport() {
    this.transporter ??= nodemailer.createTransport({
      host: process.env.OUTLOOK_SMTP_HOST ?? 'smtp.office365.com',
      port: Number(process.env.OUTLOOK_SMTP_PORT ?? 587),
      secure: false,
      requireTLS: true,
      auth: { user: process.env.OUTLOOK_SMTP_USER, pass: process.env.OUTLOOK_SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    return this.transporter;
  }

  private assertConfigured() {
    const keys = ['OUTLOOK_SMTP_USER', 'OUTLOOK_SMTP_PASSWORD', 'OUTLOOK_FROM_EMAIL'];
    if (keys.some((key) => !process.env[key] || process.env[key]!.startsWith('replace-'))) {
      throw new ServiceUnavailableException('Outlook SMTP is not configured');
    }
  }
}
