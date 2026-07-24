import * as nodemailer from 'nodemailer';
import { OutlookEmailService } from './outlook-email.service';

describe('OutlookEmailService', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('fails closed when SMTP credentials are placeholders', async () => {
    process.env.OUTLOOK_SMTP_USER = 'replace-user';
    await expect(new OutlookEmailService().send({ to: 'user@example.com', subject: 'Test', text: 'Body' })).rejects.toThrow('not configured');
  });

  it('sends HTML and text through Outlook STARTTLS SMTP', async () => {
    Object.assign(process.env, {
      OUTLOOK_SMTP_USER: 'sender@outlook.com',
      OUTLOOK_SMTP_PASSWORD: 'secret',
      OUTLOOK_FROM_EMAIL: 'sender@outlook.com',
      OUTLOOK_FROM_NAME: 'goVerifEye',
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '<message-id@outlook.com>' });
    const createTransport = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);

    await expect(new OutlookEmailService().send({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Plain body',
      html: '<p>HTML body</p>',
    })).resolves.toEqual({ id: '<message-id@outlook.com>' });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: '<p>HTML body</p>', text: 'Plain body' }));
  });
});
