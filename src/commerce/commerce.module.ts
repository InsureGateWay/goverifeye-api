import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '../products/product.entity';
import { OperationsModule } from '../operations/operations.module';
import { BackgroundJobEntity, PaymentEntity, SupportTicketEntity } from './commerce.entity';
import { CodePricingEntity } from './pricing.entity';
import { CommerceController } from './commerce.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEntity,
      PaymentEntity,
      BackgroundJobEntity,
      SupportTicketEntity,
      CodePricingEntity,
    ]),
    OperationsModule,
  ],
  controllers: [CommerceController],
  providers: [PricingService],
  exports: [PricingService],
})
export class CommerceModule {}
