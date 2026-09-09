import { BatchActivationService } from './batch-activation.service';
import { BatchActivationEventEntity, BatchActivationLimitEntity, ProductBatchEntity } from './batch-activation.entity';
import { Module } from '@nestjs/common'; import { TypeOrmModule } from '@nestjs/typeorm'; import { CodesController } from './codes.controller'; import { CodeBatchEntity, CodeNamespaceEntity, OpenMarketBatchEntity, OpenMarketClaimEntity, ScanSessionEntity, VerificationCodeEntity, VerificationEventEntity } from './code.entity'; import { CodesService } from './codes.service'; import { AnomalyDetectionService } from './anomaly-detection.service'; import { AnomalyProcessingService } from './anomaly-processing.service'; import { CryptographicCodeGenerator } from './cryptographic-code-generator.service'; import { OperationsModule } from '../operations/operations.module'; import { UserEntity } from '../auth/auth.entity'; import { CommerceModule } from '../commerce/commerce.module'; import { ScanIdentityService } from './scan-identity.service';
import { FraudCaseEntity } from '../governance/governance.entity';
import { ProductEntity } from '../products/product.entity';
@Module({
  imports: [TypeOrmModule.forFeature([BatchActivationEventEntity, BatchActivationLimitEntity, ProductBatchEntity, CodeBatchEntity, CodeNamespaceEntity, VerificationCodeEntity, VerificationEventEntity, ScanSessionEntity, OpenMarketBatchEntity, OpenMarketClaimEntity, UserEntity, FraudCaseEntity, ProductEntity]), OperationsModule, CommerceModule],
  controllers: [CodesController],
  providers: [BatchActivationService, CodesService, CryptographicCodeGenerator, ScanIdentityService, AnomalyDetectionService, AnomalyProcessingService],
  exports: [CodesService, BatchActivationService, AnomalyDetectionService, AnomalyProcessingService],
})
export class CodesModule {}
