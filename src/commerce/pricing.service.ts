import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainError } from '../common/domain-error';
import { LabelType } from '../codes/code.enums';
import { CodePricingEntity } from './pricing.entity';

const DEFAULT_PRICES: Record<LabelType, number> = {
  [LabelType.Micro]: 7.5,
  [LabelType.Main]: 0,
  [LabelType.Pair]: 14.25,
};

export type CodePricingRow = {
  labelType: LabelType;
  unitPriceNgn: number;
  updatedAt: Date;
};

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(CodePricingEntity)
    private readonly pricing: Repository<CodePricingEntity>,
  ) {}

  async list(): Promise<CodePricingRow[]> {
    await this.ensureDefaults();
    const rows = await this.pricing.find({ order: { labelType: 'ASC' } });
    return rows.map((row) => this.toRow(row));
  }

  async getUnitPrice(labelType: LabelType): Promise<number> {
    await this.ensureDefaults();
    const row = await this.pricing.findOneBy({ labelType });
    return Number(row?.unitPriceNgn ?? DEFAULT_PRICES[labelType]);
  }

  async quote(labelType: LabelType, quantity: number) {
    const unitPrice = await this.getUnitPrice(labelType);
    return {
      labelType,
      quantity,
      unitPrice,
      subtotal: Number((unitPrice * quantity).toFixed(2)),
      currency: 'NGN' as const,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
  }

  async batchCost(batch: Pick<{ labelType: LabelType; quantity: number }, 'labelType' | 'quantity'>) {
    const unitPrice = await this.getUnitPrice(batch.labelType);
    return Number((unitPrice * batch.quantity).toFixed(2));
  }

  async updatePrices(
    input: Partial<Record<LabelType, number>>,
    actorId: string,
  ): Promise<CodePricingRow[]> {
    await this.ensureDefaults();
    for (const labelType of Object.values(LabelType)) {
      const next = input[labelType];
      if (next === undefined) continue;
      if (!Number.isFinite(next) || next < 0) {
        throw new DomainError(`Invalid price for ${labelType}`, 'INVALID_CODE_PRICE', 400);
      }
      await this.pricing.update(
        { labelType },
        { unitPriceNgn: next.toFixed(2), updatedBy: actorId },
      );
    }
    return this.list();
  }

  private async ensureDefaults() {
    for (const labelType of Object.values(LabelType)) {
      const existing = await this.pricing.findOneBy({ labelType });
      if (existing) continue;
      await this.pricing.save(
        this.pricing.create({
          labelType,
          unitPriceNgn: DEFAULT_PRICES[labelType].toFixed(2),
        }),
      );
    }
  }

  private toRow(row: CodePricingEntity): CodePricingRow {
    return {
      labelType: row.labelType,
      unitPriceNgn: Number(row.unitPriceNgn),
      updatedAt: row.updatedAt,
    };
  }
}
