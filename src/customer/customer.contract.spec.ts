import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CustomerCheckBody, ConcernBody, ShopperChallengeBody, ShopperLoginBody } from './customer.dto';

describe('customer transport contracts', () => {
  const request = { verificationCode: '4827 9364 1523 5739', requestId: '22222222-2222-4222-8222-222222222222' };
  it.each(['qr', 'ocr', 'manual'])('accepts the %s channel and normalizes grouped digits', async channel => {
    const dto = plainToInstance(CustomerCheckBody, { ...request, channel });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.verificationCode).toBe('4827936415235739');
  });
  it.each(['camera', 'gallery', 'unknown'])('rejects unsupported channel %s', async channel => {
    expect((await validate(plainToInstance(CustomerCheckBody, { ...request, channel }))).some(error => error.property === 'channel')).toBe(true);
  });
  it('rejects missing retry IDs and unexpected account IDs', async () => {
    const errors = await validate(plainToInstance(CustomerCheckBody, { verificationCode: request.verificationCode, shopperId: 'attacker' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['requestId', 'shopperId']));
  });
  it('requires a receipt, an allowed reason, and a bounded JPEG attachment', async () => {
    const errors = await validate(plainToInstance(ConcernBody, { requestId: request.requestId, receipt: 'bad', reason: 'unsupported', photo: 'data:text/html;base64,AAAA' }));
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['receipt', 'reason', 'photo']));
  });
  it('validates shopper login identity and OTP shape', async () => {
    expect(await validate(plainToInstance(ShopperChallengeBody, { email: 'shopper@example.com' }))).toEqual([]);
    expect((await validate(plainToInstance(ShopperLoginBody, { challengeId: request.requestId, code: 'abc123' }))).length).toBeGreaterThan(0);
  });
  it('keeps the mobile DTO copy identical to the backend source', () => {
    const canonical = readFileSync(resolve(__dirname, 'customer.contract.ts'), 'utf8').replace(/\r\n/g, '\n');
    const mobile = readFileSync(resolve(__dirname, '../../../goverifeye-customer/src/dto/customer.contract.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(mobile).toBe('// Generated from goverifeye-api. Do not edit here.\n' + canonical);
  });
});
