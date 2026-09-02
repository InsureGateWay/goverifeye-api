import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/auth.entity';
import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import { AuditLogEntity } from '../operations/operations.entity';
import { ProductEntity } from '../products/product.entity';
import { GovernanceController } from './governance.controller';
import {
  AuditExceptionEntity, FraudCaseEntity, FraudCaseNoteEntity,
  OrganizationChangeRequestEntity, SystemIncidentEntity, UserMfaFactorEntity,
  VendorInvitationEntity, VendorStatusHistoryEntity, SystemComponentEntity, MfaLoginChallengeEntity, ApplicationOptionEntity, ApplicationOptionHistoryEntity,
} from './governance.entity';
import { GovernanceService } from './governance.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { OperationsModule } from '../operations/operations.module';
import { ProductModule } from '../products/product.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity,OrganizationEntity,OrganizationDocumentEntity,ProductEntity,AuditLogEntity,OrganizationChangeRequestEntity,UserMfaFactorEntity,MfaLoginChallengeEntity,VendorInvitationEntity,VendorStatusHistoryEntity,FraudCaseEntity,FraudCaseNoteEntity,AuditExceptionEntity,SystemIncidentEntity,SystemComponentEntity,ApplicationOptionEntity,ApplicationOptionHistoryEntity]), OnboardingModule, OperationsModule, ProductModule],
  controllers: [GovernanceController], providers: [GovernanceService], exports: [GovernanceService],
})
export class GovernanceModule {}
