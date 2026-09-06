import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { DataSource, MoreThan } from 'typeorm';
import { CodesService } from '../codes/codes.service';
import { DomainError } from '../common/domain-error';
import { ReliabilityService } from '../operations/reliability.service';
import { verificationCodeEmail } from '../operations/email-templates';
import { CustomerCheckEntity, CustomerConcernEntity, ShopperChallengeEntity, ShopperEntity, ShopperSessionEntity } from './customer.entity';
import type { ConcernReceiptDto, ConcernRequestDto, CustomerCheckDto, CustomerCheckRequestDto, CustomerHistoryDto, ShopperChallengeDto, ShopperSessionDto } from './customer.contract';

@Injectable()
export class CustomerService {
  constructor(private readonly db: DataSource, private readonly codes: CodesService, private readonly reliability: ReliabilityService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private token(header?: string) { return header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]; }

  async shopper(header?: string, required = true) {
    if (!header && !required) return null;
    const token = this.token(header);
    const session = token ? await this.db.getRepository(ShopperSessionEntity).findOneBy({ tokenHash: this.hash(token), expiresAt: MoreThan(new Date()) }) : null;
    const shopper = session ? await this.db.getRepository(ShopperEntity).findOneBy({ id: session.shopperId }) : null;
    if (!shopper) throw new DomainError('Sign in again to use your shopper account.', 'SHOPPER_SESSION_EXPIRED', 401);
    return shopper;
  }

  async requestLogin(email: string): Promise<ShopperChallengeDto> {
    email = email.trim().toLowerCase();
    const repo = this.db.getRepository(ShopperChallengeEntity);
    if (await repo.countBy({ email, createdAt: MoreThan(new Date(Date.now() - 3600000)) }) >= 5) throw new DomainError('Please wait before requesting another sign-in code.', 'RATE_LIMITED', 429);
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const challenge = await this.db.transaction(async manager => {
      const saved = await manager.save(ShopperChallengeEntity, manager.create(ShopperChallengeEntity, { email, codeHash: await argon2.hash(code), expiresAt: new Date(Date.now() + 600000) }));
      await this.reliability.enqueue(manager, 'email.send', 'shopper-login', saved.id, { to: email, ...verificationCodeEmail(code, 10) });
      return saved;
    });
    return { challengeId: challenge.id, expiresInSeconds: 600, message: 'A sign-in code has been sent to your email.' };
  }

  async login(challengeId: string, code: string): Promise<ShopperSessionDto> {
    const result = await this.db.transaction(async manager => {
      const challenge = await manager.findOne(ShopperChallengeEntity, { where: { id: challengeId }, lock: { mode: 'pessimistic_write' } });
      if (!challenge || challenge.consumed || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return null;
      challenge.attempts += 1;
      const valid = await argon2.verify(challenge.codeHash, code);
      challenge.consumed = valid;
      await manager.save(ShopperChallengeEntity, challenge);
      if (!valid) return null; // Commit failed attempts before raising the error.
      await manager.getRepository(ShopperEntity).upsert({ email: challenge.email }, ['email']);
      const shopper = await manager.findOneByOrFail(ShopperEntity, { email: challenge.email });
      const accessToken = randomBytes(32).toString('hex'), expiresAt = new Date(Date.now() + 30 * 86400000);
      await manager.save(ShopperSessionEntity, manager.create(ShopperSessionEntity, { shopperId: shopper.id, tokenHash: this.hash(accessToken), expiresAt }));
      return { accessToken, expiresAt: expiresAt.toISOString(), shopper: { id: shopper.id, email: shopper.email } };
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
