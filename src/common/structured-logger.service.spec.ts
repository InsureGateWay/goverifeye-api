import 'reflect-metadata';
import { redactLogValue, StructuredLoggerService } from './structured-logger.service';

describe('StructuredLoggerService', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('redacts secrets recursively and inside strings', () => {
    expect(redactLogValue({
      authorization: 'Bearer abc',
      password: 'secret',
      nested: {
        apiKey: 're_abcdefghijklmnopqrstuvwxyz',
        message: 'token=abc re_abcdefghijklmnopqrstuvwxyz',
      },
    })).toEqual({
      authorization: '[redacted]',
      password: '[redacted]',
      nested: {
        apiKey: '[redacted]',
        message: 'token=[redacted] [redacted]',
      },
    });
  });

  it('writes machine-readable JSON in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_FORMAT;
    const output = jest.spyOn(console, 'log').mockImplementation();
    new StructuredLoggerService().log({ event: 'test.event', correlationId: 'correlation-id' }, 'TestContext');
    const record = JSON.parse(String(output.mock.calls[0]![0]));
    expect(record).toEqual(expect.objectContaining({
      level: 'log',
      service: 'goverifeye-api',
      context: 'TestContext',
      event: 'test.event',
      correlationId: 'correlation-id',
    }));
  });
});
