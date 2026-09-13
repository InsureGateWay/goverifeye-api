import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodesModule } from '../codes/codes.module';
import { OperationsModule } from '../operations/operations.module';
import { CustomerController } from './customer.controller';
import { CustomerConcernsController } from './customer-concerns.controller';
import { CustomerService } from './customer.service';
import { CustomerCheckEntity, CustomerConcernEntity, CustomerSupportRequestEntity, ShopperChallengeEntity, ShopperEntity, ShopperSessionEntity } from './customer.entity';
import { AuditLogEntity } from '../operations/operations.entity';

@Module({ imports: [CodesModule, OperationsModule, TypeOrmModule.forFeature([AuditLogEntity, CustomerCheckEntity, CustomerConcernEntity, CustomerSupportRequestEntity, ShopperChallengeEntity, ShopperEntity, ShopperSessionEntity])], controllers: [CustomerController, CustomerConcernsController], providers: [CustomerService] })
export class CustomerModule {}
