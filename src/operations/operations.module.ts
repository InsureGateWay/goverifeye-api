import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/auth.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { BackgroundJobEntity } from '../commerce/commerce.entity'; import { VerificationCodeEntity } from '../codes/code.entity'; import { ArtifactJobService } from './artifact-job.service';
import { AuditLogEntity, IdempotencyRecordEntity, NotificationEntity, OutboxMessageEntity } from './operations.entity';
import { GmailEmailService } from './gmail-email.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { ReliabilityService } from './reliability.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, NotificationEntity, OutboxMessageEntity, IdempotencyRecordEntity, UserEntity, OrganizationEntity,BackgroundJobEntity,VerificationCodeEntity])],
  controllers: [OperationsController],
  providers: [OperationsService, ReliabilityService, GmailEmailService, ArtifactJobService,OutboxProcessorService],
  exports: [OperationsService, ReliabilityService, GmailEmailService],
})
export class OperationsModule {}
