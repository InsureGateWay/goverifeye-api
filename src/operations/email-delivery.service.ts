import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailMessage { to: string; subject: string; text: string; html?: string }

@Injectable()
export class EmailDeliveryService {
  private transporter?: Transporter;

  async send(message: EmailMessage): Promise<{ id: string }> {
    return this.usesResend() ? this.sendWithResend(message) : this.sendWithSmtp(message);
  }

  private usesResend() {
    return process.env.EMAIL_PROVIDER?.toLowerCase() === 'resend'
      || process.env.SMTP_HOST?.toLowerCase() === 'smtp.resend.com'
      || Boolean(process.env.RESEND_API_KEY);
  }

  private async sendWithResend(message: EmailMessage): Promise<{ id: string }> {
    const apiKey = process.env.RESEND_API_KEY ?? process.env.SMTP_PASSWORD;
    const fromEmail = process.env.SMTP_FROM_EMAIL;
    if (!apiKey || apiKey.startsWith('replace-') || !fromEmail || fromEmail.startsWith('replace-')) {
      throw new ServiceUnavailableException('Resend email delivery is not configured');
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: `${process.env.SMTP_FROM_NAME ?? 'goVerifEye'} <${fromEmail}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown network error';
      throw new ServiceUnavailableException(`Resend API connection failed: ${reason}`);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string; name?: string };
      const detail = String(body.message ?? body.name ?? 'Unknown provider error').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
      throw new ServiceUnavailableException(`Resend API rejected the message (${response.status}): ${detail}`);
    }
    const result = await response.json() as { id: string };
    return { id: result.id };
  }

  private async sendWithSmtp(message: EmailMessage): Promise<{ id: string }> {
    this.assertSmtpConfigured();
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
      host: process.env.SMTP_HOST,
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

  private assertSmtpConfigured() {
    const keys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
    if (keys.some((key) => !process.env[key] || process.env[key]!.startsWith('replace-'))) {
      throw new ServiceUnavailableException('SMTP email delivery is not configured');
    }
  }
}
