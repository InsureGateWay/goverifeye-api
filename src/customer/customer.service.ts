import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, MoreThan } from 'typeorm';
import { CodesService } from '../codes/codes.service';
import { DomainError } from '../common/domain-error';
import { ReliabilityService } from '../operations/reliability.service';
import { verificationCodeEmail } from '../operations/email-templates';
import { CustomerCheckEntity, CustomerConcernEntity, ShopperChallengeEntity, ShopperEntity, ShopperSessionEntity } from './customer.entity';
import type { ConcernReceiptDto, ConcernRequestDto, CustomerCheckDto, CustomerCheckRequestDto, CustomerHistoryDto, ShopperChallengeDto, ShopperDto, ShopperRegistrationVerifiedDto, ShopperSessionDto } from './customer.contract';

const persistentShopperSessionExpiry = () => new Date('9999-12-31T23:59:59.999Z');

@Injectable()
export class CustomerService {
  constructor(private readonly db: DataSource, private readonly codes: CodesService, private readonly reliability: ReliabilityService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private token(header?: string) { return header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]; }
  private shopperDto(shopper: ShopperEntity): ShopperDto {
    return { id: shopper.id, email: shopper.email, ...(shopper.displayName ? { displayName: shopper.displayName } : {}) };
  }
  private async issueSession(manager: EntityManager, shopper: ShopperEntity): Promise<ShopperSessionDto> {
    const accessToken = randomBytes(32).toString('hex'), expiresAt = persistentShopperSessionExpiry();
    await manager.save(ShopperSessionEntity, manager.create(ShopperSessionEntity, { shopperId: shopper.id, tokenHash: this.hash(accessToken), expiresAt }));
    return { accessToken, expiresAt: expiresAt.toISOString(), shopper: this.shopperDto(shopper) };
  }

  async shopper(header?: string, required = true) {
    if (!header && !required) return null;
    const token = this.token(header);
    const session = token ? await this.db.getRepository(ShopperSessionEntity).findOneBy({ tokenHash: this.hash(token), expiresAt: MoreThan(new Date()) }) : null;
    const shopper = session ? await this.db.getRepository(ShopperEntity).findOneBy({ id: session.shopperId }) : null;
    if (!shopper) throw new DomainError('Sign in again to use your shopper account.', 'SHOPPER_SESSION_EXPIRED', 401);
    return shopper;
  }

  private async requestChallenge(email: string, purpose: ShopperChallengeEntity['purpose'], message: string): Promise<ShopperChallengeDto> {
    email = email.trim().toLowerCase();
    const repo = this.db.getRepository(ShopperChallengeEntity);
    const latest = await repo.findOne({ where: { email, purpose }, order: { createdAt: 'DESC' } });
    if (latest && latest.createdAt > new Date(Date.now() - 30000)) throw new DomainError('Wait 30 seconds before requesting another verification code.', 'OTP_RESEND_COOLDOWN', 429);
    if (await repo.countBy({ email, createdAt: MoreThan(new Date(Date.now() - 3600000)) }) >= 5) throw new DomainError('Please wait before requesting another verification code.', 'RATE_LIMITED', 429);
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const challenge = await this.db.transaction(async manager => {
      await manager.update(ShopperChallengeEntity, { email, purpose, consumed: false }, { consumed: true });
      const saved = await manager.save(ShopperChallengeEntity, manager.create(ShopperChallengeEntity, { email, purpose, codeHash: await argon2.hash(code), expiresAt: new Date(Date.now() + 600000) }));
      await this.reliability.enqueue(manager, 'email.send', 'shopper-login', saved.id, { to: email, ...verificationCodeEmail(code, 10) });
      return saved;
    });
    return { challengeId: challenge.id, expiresInSeconds: 600, message };
  }

  async requestLogin(email: string): Promise<ShopperChallengeDto> {
    return this.requestChallenge(email, 'login', 'A sign-in code has been sent to your email.');
  }

  async requestRegistration(email: string): Promise<ShopperChallengeDto> {
    email = email.trim().toLowerCase();
    if (await this.db.getRepository(ShopperEntity).existsBy({ email })) {
      throw new DomainError('An account already exists for this email. Sign in instead.', 'SHOPPER_ALREADY_REGISTERED', 409);
    }
    return this.requestChallenge(email, 'registration', 'A registration code has been sent to your email.');
  }

  async requestPasswordReset(email: string): Promise<ShopperChallengeDto> {
    return this.requestChallenge(email, 'password_reset', 'If the account exists, a password reset code has been sent.');
  }

  private async verifyAction(challengeId: string, code: string, purpose: 'registration' | 'password_reset'): Promise<string | null> {
    return this.db.transaction(async manager => {
      const challenge = await manager.findOne(ShopperChallengeEntity, { where: { id: challengeId }, lock: { mode: 'pessimistic_write' } });
      if (!challenge || challenge.purpose !== purpose || challenge.consumed || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return null;
      challenge.attempts += 1;
      const valid = await argon2.verify(challenge.codeHash, code);
      if (!valid) {
        await manager.save(ShopperChallengeEntity, challenge);
        return null;
      }
      const actionToken = randomBytes(32).toString('hex');
      challenge.consumed = true;
      challenge.actionTokenHash = this.hash(actionToken);
      challenge.actionExpiresAt = new Date(Date.now() + 600000);
      await manager.save(ShopperChallengeEntity, challenge);
      return actionToken;
    });
  }

  async verifyRegistration(challengeId: string, code: string): Promise<ShopperRegistrationVerifiedDto> {
    const registrationToken = await this.verifyAction(challengeId, code, 'registration');
    if (!registrationToken) throw new DomainError('The registration code is incorrect or expired. Request a new code.', 'INVALID_REGISTRATION_CODE', 401);
    return { registrationToken, expiresInSeconds: 600 };
  }

  async verifyPasswordReset(challengeId: string, code: string) {
    const resetToken = await this.verifyAction(challengeId, code, 'password_reset');
    if (!resetToken) throw new DomainError('The password reset code is incorrect or expired. Request a new code.', 'INVALID_PASSWORD_RESET_CODE', 401);
    return { resetToken, expiresInSeconds: 600 };
  }

  async completeRegistration(registrationToken: string, displayName: string, password: string): Promise<ShopperSessionDto> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tokenHash = this.hash(registrationToken);
    const result = await this.db.transaction(async manager => {
      const challenge = await manager.findOne(ShopperChallengeEntity, { where: { actionTokenHash: tokenHash, purpose: 'registration' }, lock: { mode: 'pessimistic_write' } });
      if (!challenge || !challenge.consumed || challenge.actionCompletedAt || !challenge.actionExpiresAt || challenge.actionExpiresAt <= new Date()) return null;
      if (await manager.existsBy(ShopperEntity, { email: challenge.email })) {
        throw new DomainError('An account already exists for this email. Sign in instead.', 'SHOPPER_ALREADY_REGISTERED', 409);
      }
      const shopper = await manager.save(ShopperEntity, manager.create(ShopperEntity, {
        email: challenge.email,
        displayName: displayName.trim(),
        passwordHash,
      }));
      challenge.actionCompletedAt = new Date();
      challenge.actionTokenHash = null;
      challenge.actionExpiresAt = null;
      await manager.save(ShopperChallengeEntity, challenge);
      return this.issueSession(manager, shopper);
    });
    if (!result) throw new DomainError('Registration has expired. Request a new verification code.', 'REGISTRATION_EXPIRED', 401);
    return result;
  }

  async passwordLogin(email: string, password: string): Promise<ShopperSessionDto> {
    email = email.trim().toLowerCase();
    const shopper = await this.db.getRepository(ShopperEntity).createQueryBuilder('shopper')
      .addSelect('shopper.passwordHash')
      .where('shopper.email = :email', { email })
      .getOne();
    if (!shopper?.passwordHash || !await argon2.verify(shopper.passwordHash, password)) {
      throw new DomainError('The email or password is incorrect.', 'INVALID_SHOPPER_CREDENTIALS', 401);
    }
    return this.db.transaction(manager => this.issueSession(manager, shopper));
  }

  async completePasswordReset(resetToken: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tokenHash = this.hash(resetToken);
    const reset = await this.db.transaction(async manager => {
      const challenge = await manager.findOne(ShopperChallengeEntity, { where: { actionTokenHash: tokenHash, purpose: 'password_reset' }, lock: { mode: 'pessimistic_write' } });
      if (!challenge || !challenge.consumed || challenge.actionCompletedAt || !challenge.actionExpiresAt || challenge.actionExpiresAt <= new Date()) return false;
      const shopper = await manager.findOne(ShopperEntity, { where: { email: challenge.email } });
      if (!shopper) return false;
      shopper.passwordHash = passwordHash;
      await manager.save(ShopperEntity, shopper);
      await manager.delete(ShopperSessionEntity, { shopperId: shopper.id });
      challenge.actionCompletedAt = new Date();
      challenge.actionTokenHash = null;
      challenge.actionExpiresAt = null;
      await manager.save(ShopperChallengeEntity, challenge);
      return true;
    });
    if (!reset) throw new DomainError('Password reset has expired. Request a new verification code.', 'PASSWORD_RESET_EXPIRED', 401);
    return { passwordReset: true };
  }

  async login(challengeId: string, code: string): Promise<ShopperSessionDto> {
    const result = await this.db.transaction(async manager => {
      const challenge = await manager.findOne(ShopperChallengeEntity, { where: { id: challengeId }, lock: { mode: 'pessimistic_write' } });
      if (!challenge || challenge.purpose !== 'login' || challenge.consumed || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return null;
      challenge.attempts += 1;
      const valid = await argon2.verify(challenge.codeHash, code);
      challenge.consumed = valid;
      await manager.save(ShopperChallengeEntity, challenge);
      if (!valid) return null; // Commit failed attempts before raising the error.
      await manager.getRepository(ShopperEntity).upsert({ email: challenge.email }, ['email']);
      const shopper = await manager.findOneByOrFail(ShopperEntity, { email: challenge.email });
      return this.issueSession(manager, shopper);
    });
    if (!result) throw new DomainError('The sign-in code is incorrect or expired. Request a new code.', 'INVALID_LOGIN_CODE', 401);
    return result;
  }

  async logout(header?: string) {
    const token = this.token(header);
    if (token) await this.db.getRepository(ShopperSessionEntity).delete({ tokenHash: this.hash(token) });
    return { loggedOut: true };
  }

  private dto(row: CustomerCheckEntity): CustomerCheckDto {
    return { receipt: row.receipt, code: row.code, channel: row.channel, checkedAt: row.createdAt.toISOString(), result: row.result };
  }

  async check(input: CustomerCheckRequestDto, header: string | undefined, context: { ip?: string; userAgent?: string }): Promise<CustomerCheckDto> {
    const shopper = await this.shopper(header, false), repo = this.db.getRepository(CustomerCheckEntity);
    const reuse = (row: CustomerCheckEntity) => {
      if (row.code !== input.verificationCode || row.channel !== (input.channel ?? 'manual') || row.shopperId !== (shopper?.id ?? null)) throw new DomainError('This request identifier belongs to another check.', 'REQUEST_ID_CONFLICT', 409);
      return this.dto(row);
    };
    const previous = await repo.findOneBy({ requestId: input.requestId });
    if (previous) return reuse(previous);
    try {
      return await this.db.transaction(async manager => {
        // Insert first: the unique request ID makes retries atomic with scan counters.
        const row = await manager.save(CustomerCheckEntity, manager.create(CustomerCheckEntity, { requestId: input.requestId, shopperId: shopper?.id ?? null, receipt: randomBytes(32).toString('hex'), code: input.verificationCode, channel: input.channel ?? 'manual', result: { valid: false, status: 'pending' } }));
        row.result = await this.codes.verify(input.verificationCode, { ...context, channel: input.channel, location: input.location, customerComplaint: input.customerComplaint, shopperId: shopper?.id }, manager);
        await manager.save(CustomerCheckEntity, row);
        return this.dto(row);
      });
    } catch (error) {
      const completed = await repo.findOneBy({ requestId: input.requestId });
      if (completed) return reuse(completed);
      throw error;
    }
  }

  async details(receipt: string): Promise<CustomerCheckDto> {
    const row = /^[a-f0-9]{64}$/.test(receipt) ? await this.db.getRepository(CustomerCheckEntity).findOneBy({ receipt }) : null;
    if (!row) throw new DomainError('This check was not found.', 'CHECK_NOT_FOUND', 404);
    return this.dto(row);
  }

  async history(header: string | undefined, page: number): Promise<CustomerHistoryDto> {
    const shopper = await this.shopper(header);
    const rows = await this.db.getRepository(CustomerCheckEntity).find({ where: { shopperId: shopper!.id }, order: { createdAt: 'DESC', id: 'DESC' }, skip: (page - 1) * 20, take: 21 });
    return { items: rows.slice(0, 20).map(row => this.dto(row)), page, hasMore: rows.length > 20 };
  }

  async report(input: ConcernRequestDto): Promise<ConcernReceiptDto> {
    const check = await this.db.getRepository(CustomerCheckEntity).findOneBy({ receipt: input.receipt });
    if (!check) throw new DomainError('Check the product code before submitting a concern.', 'CHECK_NOT_FOUND', 404);
    if (input.photo) {
      const image = Buffer.from(input.photo.split(',')[1] ?? '', 'base64');
      if (image.length > 1000000 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) throw new DomainError('Choose a JPEG photo smaller than 1 MB.', 'INVALID_REPORT_PHOTO', 400);
    }
    const repo = this.db.getRepository(CustomerConcernEntity);
    const existingReport = () => repo.findOne({ where: { requestId: input.requestId }, select: { id: true, createdAt: true, checkId: true, reason: true, note: true, photo: true } });
    const reuse = (row: CustomerConcernEntity) => {
      if (row.checkId !== check.id || row.reason !== input.reason || row.note !== (input.note ?? null) || row.photo !== (input.photo ?? null)) throw new DomainError('This request identifier is already in use.', 'REQUEST_ID_CONFLICT', 409);
      return { id: row.id, submittedAt: row.createdAt.toISOString() };
    };
    const existing = await existingReport();
    if (existing) return reuse(existing);
    try {
      const row = await repo.save(repo.create({ requestId: input.requestId, checkId: check.id, reason: input.reason, note: input.note ?? null, photo: input.photo ?? null }));
      return { id: row.id, submittedAt: row.createdAt.toISOString() };
    } catch (error) {
      const completed = await existingReport();
      if (completed) return reuse(completed);
      throw error;
    }
  }
}
