import * as nodemailer from 'nodemailer';
import { EmailDeliveryService } from './email-delivery.service';

describe('EmailDeliveryService', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('sends Resend messages through HTTPS when Resend SMTP variables are present', async () => {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PASSWORD: 're_test',
      SMTP_FROM_EMAIL: 'noreply@mail.example.com',
      SMTP_FROM_NAME: 'goVerifEye',
    });
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-message-id' }), { status: 200 }),
    );

    await expect(new EmailDeliveryService().send({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Plain body',
      html: '<p>HTML body</p>',
    })).resolves.toEqual({ id: 'resend-message-id' });

    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer re_test' }),
    }));
    const options = request.mock.calls[0]![1]!;
    expect(JSON.parse(String(options.body))).toEqual(expect.objectContaining({
      from: 'goVerifEye <noreply@mail.example.com>',
      to: ['user@example.com'],
      html: '<p>HTML body</p>',
    }));
  });

  it('reports a useful Resend API rejection', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      SMTP_FROM_EMAIL: 'noreply@mail.example.com',
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Domain is not verified' }), { status: 403 }),
    );
    await expect(new EmailDeliveryService().send({ to: 'user@example.com', subject: 'Test', text: 'Body' }))
      .rejects.toThrow('Resend API rejected the message (403): Domain is not verified');
  });

  it('retains SMTP delivery for non-Resend providers', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'sender',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM_EMAIL: 'sender@example.com',
      SMTP_SECURE: 'false',
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '<message-id@example.com>' });
    const createTransport = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    await expect(new EmailDeliveryService().send({ to: 'user@example.com', subject: 'Test', text: 'Body' }))
      .resolves.toEqual({ id: '<message-id@example.com>' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com' }));
  });
});
