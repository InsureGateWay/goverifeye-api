import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, Not } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { GenerateBatchDto } from '../codes/code.dto';
import { Fulfillment, LabelType } from '../codes/code.enums';
import { CodesService } from '../codes/codes.service';
import { DomainError } from '../common/domain-error';
import { PricingService } from '../commerce/pricing.service';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { PlatformGenerateBatchDto } from './platform-generate-code.dto';

const PLATFORM_ORG_NAME = 'goVerifEye Platform Ops';
const PLACEHOLDER_PRODUCT = 'General Product';

function formatPublicBatchId(batchId: string): string {
  const digits = batchId.replace(/\D/g, '').padEnd(16, '0').slice(0, 16);
  return [
    digits.slice(0, 4),
    digits.slice(4, 8),
    digits.slice(8, 12),
    digits.slice(12, 16),
  ].join('-');
}

function formatActivationCode(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return formatPublicBatchId(digits);
}

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

    const product = await this.resolveProduct(dto.vendorId, actorId);
    const labelType = resolveLabelType(dto.labels);
    const unitPrice =
      dto.unitPrice ?? (await this.pricing.getUnitPrice(labelType));
    const estimatedCost =
      dto.estimatedCost ??
      Number((unitPrice * dto.quantity).toFixed(2));

    const generateInput: GenerateBatchDto = {
      productId: product.id,
      labelType,
      fulfillment: Fulfillment.Preprinted,
      paperSize: 'Roll',
      quantity: dto.quantity,
    };

    const generated = await this.codes.generateBatch(
      dto.vendorId,
      actorId,
      generateInput,
      idempotencyKey || randomUUID(),
    );

    const actor = await this.db.getRepository(UserEntity).findOneBy({
      id: actorId,
    });
    const generatedBy =
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      actor?.email ||
      'Platform admin';

    const batch = generated.batch as {
      id: string;
      createdAt?: Date | string;
    };
    const activationCode = generated.batchActivationCredential ?? '';

    return {
      labels: dto.labels,
      quantity: dto.quantity,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName || org.companyName,
      unitPrice,
      estimatedCost,
      batchId: formatPublicBatchId(batch.id),
      activationCode: formatActivationCode(activationCode),
      generatedOn: formatDisplayDateTime(batch.createdAt),
      generatedBy,
      status: 'awaiting_activation' as const,
    };
  }

  private async resolveProduct(organizationId: string, actorId: string) {
    const products = this.db.getRepository(ProductEntity);
    const existing = await products.findOne({
      where: {
        organizationId,
        status: ProductStatus.Active,
      },
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;

    return products.save(
      products.create({
        organizationId,
        name: PLACEHOLDER_PRODUCT,
        description:
          'Platform-generated placeholder product for admin code batches.',
        form: 'General',
        manufacturer: '—',
        status: ProductStatus.Active,
        createdBy: actorId,
      }),
    );
  }
}
