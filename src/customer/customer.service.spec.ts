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
    const challenge = { id: 'id', email: 'shopper@example.com', purpose: 'login', codeHash: await argon2.hash('123456'), consumed: false, attempts: 0, expiresAt: new Date(Date.now() + 60000) };
    const manager = { findOne: jest.fn(async () => challenge), save: jest.fn(async () => challenge) };
    const db = { transaction: jest.fn(async callback => callback(manager)) };
    const service = new CustomerService(db as never, {} as never, {} as never);
    await expect(service.login('id', '000000')).rejects.toMatchObject({ status: 401 });
    expect(challenge.attempts).toBe(1); expect(manager.save).toHaveBeenCalledWith(ShopperChallengeEntity, challenge);
    challenge.consumed = true;
    await expect(service.login('id', '123456')).rejects.toMatchObject({ status: 401 });
    expect(challenge.attempts).toBe(1);
  });
  it('labels registration challenges, invalidates older OTPs, and enforces the 30-second resend delay', async () => {
    const challenges = { findOne: jest.fn(async () => null), countBy: jest.fn(async () => 0) };
    const shoppers = { existsBy: jest.fn(async () => false) };
    const manager = { update: jest.fn(async () => ({ affected: 1 })), create: jest.fn((_type, value) => ({ ...value, id: 'challenge-id' })), save: jest.fn(async (_type, value) => value) };
    const db = { getRepository: jest.fn(type => type === ShopperChallengeEntity ? challenges : shoppers), transaction: jest.fn(async callback => callback(manager)) };
    const reliability = { enqueue: jest.fn(async () => undefined) };
    const service = new CustomerService(db as never, {} as never, reliability as never);
    await expect(service.requestRegistration(' Shopper@Example.com ')).resolves.toMatchObject({ challengeId: 'challenge-id', expiresInSeconds: 600 });
    expect(manager.update).toHaveBeenCalledWith(ShopperChallengeEntity, { email: 'shopper@example.com', purpose: 'registration', consumed: false }, { consumed: true });
    expect(manager.create).toHaveBeenCalledWith(ShopperChallengeEntity, expect.objectContaining({ email: 'shopper@example.com', purpose: 'registration' }));
    challenges.findOne.mockResolvedValue({ createdAt: new Date() } as never);
    await expect(service.requestRegistration('shopper@example.com')).rejects.toMatchObject({ code: 'OTP_RESEND_COOLDOWN', status: 429 });
    expect(reliability.enqueue).toHaveBeenCalledTimes(1);
  });
  it('turns a valid registration OTP into a short-lived one-time token without creating an account', async () => {
    const challenge: any = { id: 'id', email: 'shopper@example.com', purpose: 'registration', codeHash: await argon2.hash('123456'), consumed: false, attempts: 0, expiresAt: new Date(Date.now() + 60000), actionTokenHash: null, actionExpiresAt: null };
    const manager = { findOne: jest.fn(async () => challenge), existsBy: jest.fn(async () => false), save: jest.fn(async () => challenge) };
    const db = { transaction: jest.fn(async callback => callback(manager)) };
    const service = new CustomerService(db as never, {} as never, {} as never);
    const result = await service.verifyRegistration('id', '123456');
    expect(result.registrationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result.expiresInSeconds).toBe(600);
    expect(challenge.consumed).toBe(true);
    expect(challenge.actionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.actionExpiresAt).toBeInstanceOf(Date);
  });
  it('creates the shopper and session only after verified registration details are submitted', async () => {
    const challenge: any = { email: 'shopper@example.com', purpose: 'registration', consumed: true, actionCompletedAt: null, actionTokenHash: 'hash', actionExpiresAt: new Date(Date.now() + 60000) };
    const manager = {
      findOne: jest.fn(async () => challenge),
      existsBy: jest.fn(async () => false),
      create: jest.fn((_type, value) => value),
      save: jest.fn(async (type, value) => type === ShopperEntity ? { ...value, id: 'shopper-id' } : value),
    };
    const db = { transaction: jest.fn(async callback => callback(manager)) };
    const service = new CustomerService(db as never, {} as never, {} as never);
    const result = await service.completeRegistration('a'.repeat(64), '  Ada Shopper  ', 'Correct horse battery staple 1');
    expect(result.accessToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result.shopper).toEqual({ id: 'shopper-id', email: 'shopper@example.com', displayName: 'Ada Shopper' });
    expect(challenge.actionCompletedAt).toBeInstanceOf(Date);
    expect(challenge.actionTokenHash).toBeNull();
    expect(manager.save).toHaveBeenCalledWith(ShopperSessionEntity, expect.objectContaining({ shopperId: 'shopper-id' }));
  });
  it('replaces the password and revokes existing sessions after password-reset OTP verification', async () => {
    const challenge: any = { email: 'shopper@example.com', purpose: 'password_reset', consumed: true, actionCompletedAt: null, actionTokenHash: 'hash', actionExpiresAt: new Date(Date.now() + 60000) };
    const shopper: any = { id: 'shopper-id', email: challenge.email, passwordHash: 'old-hash' };
    const manager = { findOne: jest.fn(async type => type === ShopperChallengeEntity ? challenge : shopper), save: jest.fn(async (_type, value) => value), delete: jest.fn(async () => ({ affected: 2 })) };
    const db = { transaction: jest.fn(async callback => callback(manager)) };
    const service = new CustomerService(db as never, {} as never, {} as never);
    await expect(service.completePasswordReset('b'.repeat(64), 'New password 123')).resolves.toEqual({ passwordReset: true });
    await expect(argon2.verify(shopper.passwordHash, 'New password 123')).resolves.toBe(true);
    expect(manager.delete).toHaveBeenCalledWith(ShopperSessionEntity, { shopperId: shopper.id });
    expect(challenge.actionCompletedAt).toBeInstanceOf(Date);
    expect(challenge.actionTokenHash).toBeNull();
  });
});
