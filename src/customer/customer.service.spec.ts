import * as argon2 from 'argon2';
import { CustomerService } from './customer.service';
import { CustomerCheckEntity, ShopperChallengeEntity, ShopperEntity, ShopperSessionEntity } from './customer.entity';

describe('shopper isolation and verification retries', () => {
  const now = new Date();
  const check = { id: 'check', requestId: 'request', receipt: 'a'.repeat(64), code: '4827936415235739', channel: 'qr', shopperId: null, result: { valid: false, status: 'invalid' }, createdAt: now };
  function harness(existing: unknown = null) {
    const checks = { findOneBy: jest.fn(async () => existing), find: jest.fn(async () => []), create: jest.fn(value => value) };
    const sessions = { findOneBy: jest.fn(async () => null), delete: jest.fn() };
    const shoppers = { findOneBy: jest.fn(async () => null) };
    const manager = { create: jest.fn((_type, value) => value), save: jest.fn(async (_type, value) => ({ ...value, id: 'check', createdAt: now })) };
    const db = { getRepository: jest.fn(type => type === CustomerCheckEntity ? checks : type === ShopperSessionEntity ? sessions : shoppers), transaction: jest.fn(async callback => callback(manager)) };
    const codes = { verify: jest.fn(async () => ({ valid: false, status: 'invalid' })) };
    return { service: new CustomerService(db as never, codes as never, {} as never), checks, sessions, shoppers, db, manager, codes };
  }
  it('does not accept a vendor JWT as a shopper session', async () => {
    const { service, sessions } = harness();
    await expect(service.shopper('Bearer ey.vendor.jwt')).rejects.toMatchObject({ status: 401 });
    expect(sessions.findOneBy).not.toHaveBeenCalled();
  });
  it('requires authentication before reading any saved history', async () => {
    const { service, checks } = harness();
    await expect(service.history(undefined, 1)).rejects.toMatchObject({ status: 401 });
    expect(checks.find).not.toHaveBeenCalled();
  });
  it('returns the original receipt without recording a duplicate scan', async () => {
    const { service, codes } = harness(check);
    const result = await service.check({ verificationCode: check.code, channel: 'qr', requestId: 'request' }, undefined, {});
    expect(result.receipt).toBe(check.receipt); expect(codes.verify).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('shopperId'); expect(result).not.toHaveProperty('requestId');
  });
  it('rejects reuse of a request ID for a different code', async () => {
    const { service } = harness(check);
    await expect(service.check({ verificationCode: '1111222233334444', channel: 'qr', requestId: 'request' }, undefined, {})).rejects.toMatchObject({ status: 409 });
  });
  it('does not expose an authenticated shopper check through an idempotency retry by a guest', async () => {
    const { service } = harness({ ...check, shopperId: 'someone-else' });
    await expect(service.check({ verificationCode: check.code, channel: 'qr', requestId: 'request' }, undefined, {})).rejects.toMatchObject({ status: 409 });
  });
  it('records the receipt and scan inside the same transaction', async () => {
    const { service, codes, manager } = harness();
    await service.check({ verificationCode: check.code, channel: 'ocr', requestId: 'new-request' }, undefined, { ip: '127.0.0.1' });
    expect(codes.verify).toHaveBeenCalledWith(check.code, expect.objectContaining({ channel: 'ocr' }), manager);
    expect(manager.save).toHaveBeenCalledTimes(2);
  });
  it('filters saved history by the authenticated shopper, with capped pagination', async () => {
    const { service, sessions, shoppers, checks } = harness();
    sessions.findOneBy.mockResolvedValue({ shopperId: 'owner' } as never);
    shoppers.findOneBy.mockResolvedValue({ id: 'owner', email: 'owner@example.com' } as never);
    await service.history('Bearer ' + 'b'.repeat(64), 2);
    expect(checks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { shopperId: 'owner' }, skip: 20, take: 21 }));
  });
  it('commits incorrect OTP attempts and rejects a consumed challenge', async () => {
    const challenge = { id: 'id', email: 'shopper@example.com', codeHash: await argon2.hash('123456'), consumed: false, attempts: 0, expiresAt: new Date(Date.now() + 60000) };
    const manager = { findOne: jest.fn(async () => challenge), save: jest.fn(async () => challenge) };
    const db = { transaction: jest.fn(async callback => callback(manager)) };
    const service = new CustomerService(db as never, {} as never, {} as never);
    await expect(service.login('id', '000000')).rejects.toMatchObject({ status: 401 });
    expect(challenge.attempts).toBe(1); expect(manager.save).toHaveBeenCalledWith(ShopperChallengeEntity, challenge);
    challenge.consumed = true;
    await expect(service.login('id', '123456')).rejects.toMatchObject({ status: 401 });
    expect(challenge.attempts).toBe(1);
  });
});
