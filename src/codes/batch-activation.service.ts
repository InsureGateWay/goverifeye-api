import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { DataSource, EntityManager } from 'typeorm';
import batchActivationConfig, { BatchActivationOptions } from '../config/batch-activation.config';
import { UserEntity } from '../auth/auth.entity';
import { RequestContext } from '../common/request-context';
import { DomainError } from '../common/domain-error';
import { AuditLogEntity } from '../operations/operations.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { CodeBatchEntity, CodeNamespaceEntity, VerificationCodeEntity } from './code.entity';
import { BatchStatus, VerificationCodeStatus } from './code.enums';
import { BatchActivationEventEntity, BatchActivationLimitEntity, ProductBatchEntity } from './batch-activation.entity';
import { ActivateCodeBatchDto, RevealBatchPinDto } from './batch-activation.dto';
import { batchLookup, canonicalBatchId, displayBatchReference } from './batch-format';

const COOLDOWN_MS = 15 * 60_000;
type Failure = { error: DomainError };

@Injectable()
export class BatchActivationService {
  constructor(private readonly db: DataSource, @Inject(batchActivationConfig.KEY) private readonly options: BatchActivationOptions) {}

  async release(batchKey: string, actor: RequestContext) {
    if (!['super_admin', 'platform_admin', 'platform_staff'].includes(actor.role)) throw new DomainError('Platform authorization required', 'FORBIDDEN', 403);
    return this.db.transaction(async manager => {
      const batch = await this.findBatch(manager, batchKey);
      if (!batch) throw new DomainError('Code batch was not found', 'BATCH_NOT_FOUND', 404);
      if (batch.activationMode !== 'controlled_physical_print' || ![BatchStatus.Allocated, BatchStatus.ReleasedForActivation].includes(batch.status)) throw new DomainError('Batch cannot be released', 'BATCH_NOT_RELEASABLE', 409);
      if (batch.allocationVendorId !== batch.organizationId || !batch.namespace) throw new DomainError('Vendor and namespace assignment are required before release', 'BATCH_ASSIGNMENT_INVALID', 409);
      if (batch.releasedAt) return { batchReference: displayBatchReference(batch.batchReference), releasedAt: batch.releasedAt, alreadyReleased: true };
      batch.releasedAt = new Date();
      batch.releasedBy = actor.userId;
      batch.status = BatchStatus.ReleasedForActivation;
      await manager.save(CodeBatchEntity, batch);
      await this.event(manager, actor, batch, 'released', 'success');
      return { batchReference: displayBatchReference(batch.batchReference), releasedAt: batch.releasedAt };
    });
  }

  async reveal(batchKey: string, actor: RequestContext, input: RevealBatchPinDto, source: string) {
    const result = await this.db.transaction(async manager => {
      const access = await this.vendorAccess(manager, batchKey, actor, source);
      if ('error' in access) return access;
      const { batch, limits } = access;
      if (batch.activationMode !== 'controlled_physical_print' || batch.status !== BatchStatus.ReleasedForActivation || !batch.releasedAt) return this.reject(manager, actor, batch, 'reveal_rejected', 'Batch is not released for PIN reveal', 'BATCH_NOT_RELEASED', 409);
      if (!await this.stepUp(manager, actor, input.password)) return this.failedAttempt(manager, actor, batch, limits, 'step_up_failed', 'Re-authentication failed', 'STEP_UP_REQUIRED');
      // Even an unlucky random repeat must not leave the previous PIN usable.
      let pin: string;
      do { pin = randomInt(0, 100_000_000).toString().padStart(8, '0'); } while (this.validPin(batch, pin));
      const replacing = Boolean(batch.activationPinDigest);
      batch.activationPinDigest = this.digest(batch.id, pin, this.options.pepperVersion);
      batch.activationPepperVersion = this.options.pepperVersion;
      batch.pinRevealedAt = new Date();
      await manager.save(CodeBatchEntity, batch);
      await this.event(manager, actor, batch, replacing ? 'pin_reset' : 'pin_revealed', 'success', input.reason);
      // This is the sole response allowed to carry the PIN. Never return the entity.
      return { batchReference: displayBatchReference(batch.batchReference), pin: `${pin.slice(0, 4)} ${pin.slice(4)}`, revealedAt: batch.pinRevealedAt };
    });
    if ('error' in result) throw result.error;
    return result;
  }

  async activate(batchKey: string, actor: RequestContext, input: ActivateCodeBatchDto, source: string) {
    const result = await this.db.transaction(async manager => {
      const access = await this.vendorAccess(manager, batchKey, actor, source);
      if ('error' in access) return access;
      const { batch, limits } = access;
      if (input.confirm !== true) return this.reject(manager, actor, batch, 'activation_rejected', 'Explicit activation confirmation is required', 'ACTIVATION_CONFIRMATION_REQUIRED', 400);
      const controlled = batch.activationMode === 'controlled_physical_print';
      if (controlled && !await this.stepUp(manager, actor, input.password)) return this.failedAttempt(manager, actor, batch, limits, 'step_up_failed', 'Re-authentication failed', 'STEP_UP_REQUIRED');
      if (batch.status === BatchStatus.MarketActive) return { batchReference: displayBatchReference(batch.batchReference), activatedCodes: 0, alreadyActivated: true, activatedAt: batch.activatedAt };
      if (controlled ? batch.status !== BatchStatus.ReleasedForActivation || !batch.releasedAt : batch.status !== BatchStatus.Allocated) return this.reject(manager, actor, batch, 'activation_rejected', 'Batch is not ready for activation', 'BATCH_NOT_ACTIVATABLE', 409);
      if (controlled && !this.validPin(batch, input.pin ?? '')) return this.failedAttempt(manager, actor, batch, limits, 'pin_failed', 'The activation PIN is invalid', 'BATCH_ACTIVATION_INVALID');
      const lotReference = input.productBatchReference?.trim();
      if (!lotReference || lotReference.length > 100) return this.reject(manager, actor, batch, 'binding_rejected', 'Manufacturer product lot is required', 'PRODUCT_BATCH_REQUIRED', 400);
      const product = await manager.findOne(ProductEntity, { where: { id: batch.productId, organizationId: actor.organizationId, status: ProductStatus.Active }, lock: { mode: 'pessimistic_write' } });
      const namespace = await manager.findOneBy(CodeNamespaceEntity, { organizationId: actor.organizationId, namespace: batch.namespace! });
      const codes = await manager.getRepository(VerificationCodeEntity).createQueryBuilder('code').where('code.batchId = :batchId', { batchId: batch.id }).orderBy('code.id', 'ASC').setLock('pessimistic_write').getMany();
      if (!product || !namespace || codes.length !== batch.quantity || codes.some(code => code.organizationId !== batch.allocationVendorId || code.productId !== batch.productId || code.namespace !== batch.namespace || code.allocationId !== batch.id || code.unitId !== code.id || code.status !== VerificationCodeStatus.Allocated)) return this.reject(manager, actor, batch, 'binding_rejected', 'Vendor, namespace or product binding is invalid', 'BATCH_BINDING_INVALID', 409);
      // Product lock serializes creation of the same manufacturer lot across batches.
      let lot = await manager.findOneBy(ProductBatchEntity, { organizationId: actor.organizationId, productId: product.id, lotReference });
      if (!lot) lot = await manager.save(ProductBatchEntity, manager.create(ProductBatchEntity, { organizationId: actor.organizationId, productId: product.id, lotReference, manufacturingDate: batch.manufacturingDate, expiryDate: batch.expiryDate }));
      if ((batch.manufacturingDate && lot.manufacturingDate !== batch.manufacturingDate) || (batch.expiryDate && lot.expiryDate !== batch.expiryDate)) return this.reject(manager, actor, batch, 'binding_rejected', 'Product lot dates conflict with this batch', 'PRODUCT_BATCH_DATES_CONFLICT', 409);
      const now = new Date();
      await manager.update(VerificationCodeEntity, { batchId: batch.id, organizationId: actor.organizationId, status: VerificationCodeStatus.Allocated }, { status: VerificationCodeStatus.MarketActive, productBatchId: lot.id, activatedAt: now, activatedBy: actor.userId });
      batch.productBatchId = lot.id;
      batch.status = BatchStatus.MarketActive;
      batch.activatedAt = now;
      batch.activatedBy = actor.userId;
      batch.activationPinDigest = null;
      batch.activationPepperVersion = null;
      await manager.save(CodeBatchEntity, batch);
      await this.event(manager, actor, batch, 'activated', 'success');
      return { batchReference: displayBatchReference(batch.batchReference), activatedCodes: codes.length, activatedAt: now, productBatchId: lot.id };
    });
    // Failed attempts must commit before the HTTP error is raised.
    if ('error' in result) throw result.error;
    return result;
  }

  private async findBatch(manager: EntityManager, key: string) {
    const lookup = batchLookup(key);
    if (!lookup) return null;
    return manager.getRepository(CodeBatchEntity).createQueryBuilder('batch')
      .addSelect(['batch.activationPinDigest', 'batch.activationPepperVersion'])
      .where(lookup).setLock('pessimistic_write').getOne();
  }

  private async vendorAccess(manager: EntityManager, key: string, actor: RequestContext, source: string) {
    if (actor.role !== 'vendor_admin') return this.reject(manager, actor, null, 'access_rejected', 'Vendor administrator authorization required', 'FORBIDDEN', 403);
    // A stable, sorted lock order serializes shared vendor/source counters across API instances.
    const scopes = [`vendor:${actor.organizationId}`, `source:${source || 'unknown'}`].map(value => createHash('sha256').update(value).digest('hex')).sort();
    const limits: BatchActivationLimitEntity[] = [];
    for (const scope of scopes) limits.push(await this.lockLimit(manager, scope));
    const batch = await this.findBatch(manager, key);
    if (!batch || batch.organizationId !== actor.organizationId || batch.allocationVendorId !== actor.organizationId) return this.reject(manager, actor, batch, 'access_rejected', 'Code batch was not found', 'BATCH_NOT_FOUND', 404);
    limits.push(await this.lockLimit(manager, createHash('sha256').update(`batch:${batch.id}`).digest('hex')));
    const now = Date.now();
    const activeCooldowns = limits
      .map(limit => limit.cooldownUntil)
      .filter((value): value is Date => Boolean(value && value.getTime() > now));
    if (activeCooldowns.length) {
      const cooldownUntil = new Date(Math.max(...activeCooldowns.map(value => value.getTime())));
      await this.event(manager, actor, batch, 'cooldown_rejected', 'failure');
      return { error: this.cooldownError(cooldownUntil) };
    }
    return { batch, limits };
  }

  private async lockLimit(manager: EntityManager, key: string) {
    await manager.createQueryBuilder().insert().into(BatchActivationLimitEntity).values({ key, failures: [] }).orIgnore().execute();
    return (await manager.findOne(BatchActivationLimitEntity, { where: { key }, lock: { mode: 'pessimistic_write' } }))!;
  }

  private async stepUp(manager: EntityManager, actor: RequestContext, password?: string) {
    if (!password) return false;
    const user = await manager.findOneBy(UserEntity, { id: actor.userId, organizationId: actor.organizationId, isActive: true });
    return Boolean(user && user.role === 'vendor_admin' && !user.mustChangePassword && await argon2.verify(user.passwordHash, password));
  }

  private digest(batchId: string, pin: string, version: string) {
    const pepper = this.options.peppers[version];
    if (!pepper) throw new DomainError('Activation key version is unavailable', 'ACTIVATION_KEY_UNAVAILABLE', 503);
    return createHmac('sha256', pepper).update(`${canonicalBatchId(batchId)}:${pin}`, 'utf8').digest('hex');
  }

  private validPin(batch: CodeBatchEntity, pin: string): boolean {
    if (!/^[0-9]{8}$/.test(pin) || !batch.activationPinDigest || !batch.activationPepperVersion) return false;
    const actual = Buffer.from(this.digest(batch.id, pin, batch.activationPepperVersion), 'hex');
    const expected = Buffer.from(batch.activationPinDigest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private async failedAttempt(manager: EntityManager, actor: RequestContext, batch: CodeBatchEntity, limits: BatchActivationLimitEntity[], action: string, message: string, code: string): Promise<Failure> {
    const now = Date.now();
    let locked = false;
    for (const limit of limits) {
      limit.failures = limit.failures.filter(time => time > now - this.options.windowMs);
      limit.failures.push(now);
      if (limit.failures.length >= this.options.maxAttempts) { limit.cooldownUntil = new Date(now + COOLDOWN_MS); locked = true; }
      await manager.save(BatchActivationLimitEntity, limit);
    }
    await this.event(manager, actor, batch, action, 'failure');
    if (locked) await this.event(manager, actor, batch, 'cooldown_started', 'failure');
    return {
      error: locked
        ? this.cooldownError(new Date(now + COOLDOWN_MS))
        : new DomainError(message, code, 401),
    };
  }

  private cooldownError(cooldownUntil: Date) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((cooldownUntil.getTime() - Date.now()) / 1000),
    );
    return new DomainError(
      'Activation is temporarily unavailable; try again after the cooldown',
      'ACTIVATION_COOLDOWN',
      429,
      { retryAt: cooldownUntil.toISOString(), retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }

  private async reject(manager: EntityManager, actor: RequestContext, batch: CodeBatchEntity | null, action: string, message: string, code: string, status: number): Promise<Failure> {
    await this.event(manager, actor, batch, action, 'failure');
    return { error: new DomainError(message, code, status) };
  }

  private async event(manager: EntityManager, actor: RequestContext, batch: CodeBatchEntity | null, action: string, outcome: string, reason?: string) {
    await manager.insert(BatchActivationEventEntity, { batchId: batch?.id ?? null, organizationId: actor.organizationId, actorId: actor.userId, sessionId: actor.sessionId, action, outcome, reason: reason?.replace(/\b\d{4}[\s-]?\d{4}\b/g, '[redacted]') });
    await manager.insert(AuditLogEntity, { organizationId: actor.organizationId, actorId: actor.userId, action: `batch.${action}`, resourceType: 'code_batch', resourceId: batch?.id, status: outcome, metadata: { sessionId: actor.sessionId } });
  }
}
