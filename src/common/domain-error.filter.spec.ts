import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { DomainErrorFilter } from './domain-error.filter';

function harness(error: unknown) {
  const insert = jest.fn().mockResolvedValue({});
  const response = {
    getHeader: jest.fn().mockReturnValue('correlation-123'),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const request = {
    method: 'POST', originalUrl: '/api/v1/products?secret=hidden', path: '/api/v1/products',
    route: { path: '/products' }, headers: { 'user-agent': 'jest' }, ip: '127.0.0.1',
    user: { userId: 'user-id', organizationId: 'organization-id', role: 'admin', sessionId: 'session-id' },
  };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as ArgumentsHost;
  const filter = new DomainErrorFilter({ getRepository: () => ({ insert }) } as never);
  return { run: () => filter.catch(error, host), insert, response };
}

describe('DomainErrorFilter', () => {
  it('stores an unexpected exception and returns a safe 503 response', async () => {
    const test = harness(new Error('database password must never reach the caller'));
    await test.run();

    expect(test.insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'runtime', originalStatus: 500, severity: 'high', requestPath: '/api/v1/products',
    }));
    expect(test.response.status).toHaveBeenCalledWith(503);
    expect(test.response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 503, code: 'SERVICE_TEMPORARILY_UNAVAILABLE',
    }));
    expect(test.response.json.mock.calls[0][0]).not.toEqual(expect.objectContaining({
      title: expect.stringContaining('database password'),
    }));
  });

  it('stores handled client exceptions and preserves their response status', async () => {
    const test = harness(new BadRequestException('Invalid product payload'));
    await test.run();

    expect(test.insert).toHaveBeenCalledWith(expect.objectContaining({ originalStatus: 400, severity: 'low' }));
    expect(test.response.status).toHaveBeenCalledWith(400);
  });

  it('still returns a safe response when exception persistence fails', async () => {
    const test = harness(new Error('failure'));
    test.insert.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(test.run()).resolves.toBeUndefined();
    expect(test.response.status).toHaveBeenCalledWith(503);
  });
});
