import { formatDeliveryError } from './outbox-processor.service';

describe('formatDeliveryError', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('includes useful SMTP diagnostics', () => {
    const error = Object.assign(new Error('Invalid login: 535 Authentication unsuccessful'), {
      code: 'EAUTH',
      responseCode: 535,
      command: 'AUTH LOGIN',
    });
    expect(formatDeliveryError(error)).toBe(
      'message="Invalid login: 535 Authentication unsuccessful" code=EAUTH smtpStatus=535 command=AUTH LOGIN',
    );
  });

  it('redacts configured credentials and removes control characters', () => {
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASSWORD = 'super-secret';
    const error = new Error('Login sender@example.com\r\n password=super-secret');
    const formatted = formatDeliveryError(error);
    expect(formatted).not.toContain('sender@example.com');
    expect(formatted).not.toContain('super-secret');
    expect(formatted).not.toContain('\n');
    expect(formatted).toContain('[redacted]');
  });
});
