import { displayBatchReference, masterQrPayload } from '../codes/batch-format';
import { Injectable } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, Not } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import type { RequestContext } from '../common/request-context';
import { GenerateBatchDto } from '../codes/code.dto';
import { Fulfillment, LabelType } from '../codes/code.enums';
import { CodeBatchEntity, OpenMarketBatchEntity } from '../codes/code.entity';
import { CodesService } from '../codes/codes.service';
import { DomainError } from '../common/domain-error';
import { PricingService } from '../commerce/pricing.service';
import { AuditLogEntity } from '../operations/operations.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { ASSIGNED_BATCH_PLACEHOLDER_PRODUCT } from '../codes/internal-products';
import {
  PlatformGenerateBatchDto,
  PlatformGenerateOpenMarketBatchDto,
} from './platform-generate-code.dto';

const PLATFORM_ORG_NAME = 'goVerifEye Platform Ops';
const PLACEHOLDER_PRODUCT = 'General Product';

function formatDisplayDateTime(value?: Date | string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}; ${time}`;
}

function resolveLabelType(labels: Array<'micro' | 'main'>): LabelType {
  const hasMicro = labels.includes('micro');
  const hasMain = labels.includes('main');
  if (hasMicro && hasMain) return LabelType.Pair;
  if (hasMain) return LabelType.Main;
  return LabelType.Micro;
}

function openMarketBatchId(): string {
  const digits = `${randomInt(0, 100_000_000).toString().padStart(8, '0')}${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
  return digits.match(/.{4}/g)!.join('-');
}

function openMarketActivationCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

@Injectable()
export class PlatformGenerateCodeService {
  constructor(
    private readonly db: DataSource,
    private readonly codes: CodesService,
    private readonly pricing: PricingService,
  ) {}

  async listVendors(query = '') {
    const orgs = await this.db.getRepository(OrganizationEntity).find({
      where: {
        status: 'approved',
        companyName: Not(PLATFORM_ORG_NAME),
      },
      order: { companyName: 'ASC' },
      take: 200,
    });

    const q = query.trim().toLowerCase();
    return orgs
      .filter((org) => {
        if (!q) return true;
        const hay = `${org.companyName} ${org.administrator?.email ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .map((org) => ({
        id: org.id,
        name: org.companyName,
        email: org.administrator?.email || '—',
      }));
  }

  async createBatch(
    actorId: string,
    dto: PlatformGenerateBatchDto,
    idempotencyKey: string,
  ) {
    const org = await this.db.getRepository(OrganizationEntity).findOneBy({
      id: dto.vendorId,
      status: 'approved',
    });
    if (!org || org.companyName === PLATFORM_ORG_NAME) {
      throw new DomainError(
        'Vendor organization was not found or is not approved',
        'VENDOR_NOT_FOUND',
        404,
      );
    }

    const labelType = resolveLabelType(dto.labels);
    const unitPrice =
      dto.unitPrice ?? (await this.pricing.getUnitPrice(labelType));
    const estimatedCost =
      dto.estimatedCost ??
      Number((unitPrice * dto.quantity).toFixed(2));

    const generated = await this.db.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `assigned-placeholder:${dto.vendorId}`,
      ]);
      const product = await this.resolveAssignedPlaceholder(
        manager,
        dto.vendorId,
        actorId,
        org.companyName,
      );
      const generateInput: GenerateBatchDto = {
        productId: product.id,
        labelType,
        fulfillment: Fulfillment.Preprinted,
        paperSize: 'Roll',
        quantity: dto.quantity,
      };
      return this.codes.generateBatchInTransaction(
        manager,
        dto.vendorId,
        actorId,
        generateInput,
        idempotencyKey || randomUUID(),
      );
    });

    const actor = await this.db.getRepository(UserEntity).findOneBy({
      id: actorId,
    });
    const generatedBy =
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      actor?.email ||
      'Platform admin';

    const batch = generated.batch;

    return {
      labels: dto.labels,
      quantity: dto.quantity,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName || org.companyName,
      productName: 'Selected during activation',
      unitPrice,
      estimatedCost,
      batchId: displayBatchReference(batch.batchReference),
      batchReference: displayBatchReference(batch.batchReference),
      masterQrPayload: masterQrPayload(batch),
      generatedOn: formatDisplayDateTime(batch.createdAt),
      generatedBy,
      status: 'awaiting_activation' as const,
    };
  }

  private async resolveAssignedPlaceholder(
    manager: EntityManager,
    organizationId: string,
    actorId: string,
    vendorName: string,
  ) {
    const products = manager.getRepository(ProductEntity);
    const existing = await products.findOneBy({
      organizationId,
      name: ASSIGNED_BATCH_PLACEHOLDER_PRODUCT,
      status: ProductStatus.Active,
    });
    if (existing) return existing;
    return products.save(
      products.create({
        organizationId,
        name: ASSIGNED_BATCH_PLACEHOLDER_PRODUCT,
        description:
          'Internal holding product for a platform-assigned batch awaiting vendor activation.',
        form: 'Unassigned',
        manufacturer: vendorName,
        status: ProductStatus.Active,
        createdBy: actorId,
      }),
    );
  }

  async createOpenMarketBatch(
    actor: RequestContext,
    dto: PlatformGenerateOpenMarketBatchDto,
    idempotencyKey: string,
  ) {
    const inventoryIdempotencyKey = `open-market:${createHash('sha256').update(idempotencyKey).digest('hex')}`;
    const platform = await this.db.getRepository(OrganizationEntity).findOneBy({
      companyName: PLATFORM_ORG_NAME,
      status: 'approved',
    });
    if (!platform) {
      throw new DomainError(
        'The platform inventory organization is unavailable',
        'PLATFORM_INVENTORY_UNAVAILABLE',
        503,
      );
    }

    const labelType = resolveLabelType(dto.labels);
    const unitPrice = dto.unitPrice ?? (await this.pricing.getUnitPrice(labelType));
    const estimatedCost =
      dto.estimatedCost ?? Number((unitPrice * dto.quantity).toFixed(2));
    const activationCode = openMarketActivationCode();
    const activationCodeHash = await argon2.hash(activationCode, {
      type: argon2.argon2id,
    });
    const created = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [inventoryIdempotencyKey]);
      const existingBatch = await manager.findOneBy(CodeBatchEntity, {
        organizationId: platform.id,
        clientRequestId: inventoryIdempotencyKey,
      });
      if (existingBatch) {
        const existingInventory = await manager.findOneBy(OpenMarketBatchEntity, {
          claimedCodeBatchId: existingBatch.id,
        });
        if (existingInventory) {
          return { inventory: existingInventory, batch: existingBatch, replayed: true };
        }
      }

      const product = await this.resolveInventoryProduct(manager, platform.id, actor.userId);
      const generated = await this.codes.generateBatchInTransaction(
        manager,
        platform.id,
        actor.userId,
        {
          productId: product.id,
          labelType,
          fulfillment: Fulfillment.Preprinted,
          paperSize: 'Roll',
          quantity: dto.quantity,
        },
        inventoryIdempotencyKey,
      );
      let publicBatchId = openMarketBatchId();
      while (await manager.exists(OpenMarketBatchEntity, { where: { publicBatchId } })) {
        publicBatchId = openMarketBatchId();
      }
      const row = await manager.save(
        OpenMarketBatchEntity,
        manager.create(OpenMarketBatchEntity, {
          publicBatchId,
          activationCodeHash,
          labelType,
          quantity: dto.quantity,
          totalCost: estimatedCost,
          status: 'available',
          claimedCodeBatchId: generated.batch.id,
        }),
      );
      await manager.save(
        AuditLogEntity,
        manager.create(AuditLogEntity, {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: 'platform.open_market_batch.generated',
          resourceType: 'open_market_batch',
          resourceId: row.id,
          status: 'success',
          metadata: { codeBatchId: generated.batch.id, quantity: dto.quantity, labelType },
        }),
      );
      return { inventory: row, batch: generated.batch, replayed: false };
    });

    return this.openMarketResult(
      created.inventory,
      created.batch,
      actor.userId,
      created.replayed ? undefined : activationCode,
      created.replayed,
      unitPrice,
    );
  }

  private async resolveInventoryProduct(manager: EntityManager, organizationId: string, actorId: string) {
    const products = manager.getRepository(ProductEntity);
    const existing = await products.findOneBy({
      organizationId,
      name: PLACEHOLDER_PRODUCT,
      status: ProductStatus.Active,
    });
    if (existing) return existing;
    return products.save(
      products.create({
        organizationId,
        name: PLACEHOLDER_PRODUCT,
        description: 'Temporary holding product for unassigned code inventory.',
        form: 'Unassigned',
        manufacturer: PLATFORM_ORG_NAME,
        status: ProductStatus.Active,
        createdBy: actorId,
      }),
    );
  }

  private async openMarketResult(
    inventory: OpenMarketBatchEntity,
    batch: CodeBatchEntity,
    actorId: string,
    activationCode?: string,
    replayed = false,
    unitPrice?: number,
  ) {
    const actor = await this.db.getRepository(UserEntity).findOneBy({ id: actorId });
    const generatedBy =
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      actor?.email ||
      'Platform admin';
    return {
      mode: 'open_market' as const,
      labels:
        inventory.labelType === LabelType.Pair
          ? ['micro', 'main']
          : [inventory.labelType === LabelType.Main ? 'main' : 'micro'],
      quantity: inventory.quantity,
      vendorId: '',
      vendorName: 'Unassigned - any approved vendor',
      productId: '',
      productName: 'Selected during activation',
      unitPrice: unitPrice ?? Number(inventory.totalCost) / inventory.quantity,
      estimatedCost: Number(inventory.totalCost),
      batchId: inventory.publicBatchId,
      batchReference: displayBatchReference(batch.batchReference),
      masterQrPayload: masterQrPayload(batch),
      activationCode: activationCode
        ? `${activationCode.slice(0, 4)} ${activationCode.slice(4)}`
        : undefined,
      generatedOn: formatDisplayDateTime(batch.createdAt),
      generatedBy,
      status: 'awaiting_activation' as const,
      replayed,
      ...(replayed
        ? { warning: 'This request was already completed. The activation code cannot be displayed again.' }
        : {}),
    };
  }

}
