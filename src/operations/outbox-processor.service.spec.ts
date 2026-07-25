import { Logger } from '@nestjs/common';
import { OutboxProcessorService, formatDeliveryError } from './outbox-processor.service';

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

  it('keeps the worker alive and retries after a transient database failure', async () => {
    const service = new OutboxProcessorService({} as never, {} as never, {} as never);
    const connectionError = Object.assign(new Error('Connection terminated unexpectedly'), {
      code: 'ECONNRESET',
      syscall: 'read',
    });
    const claim = jest.spyOn(service as unknown as { claim: () => Promise<unknown> }, 'claim')
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(null);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.drain()).resolves.toBeUndefined();
    await expect(service.drain()).resolves.toBeUndefined();

    expect(claim).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('application will remain running'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('code=ECONNRESET'));
  });
});
