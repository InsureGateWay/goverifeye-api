import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/auth.entity';
import {
  CodeBatchEntity,
  VerificationCodeEntity,
  VerificationEventEntity,
} from '../codes/code.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { AuditLogEntity } from '../operations/operations.entity';
import { OperationsModule } from '../operations/operations.module';
import { CodesModule } from '../codes/codes.module';
import { CommerceModule } from '../commerce/commerce.module';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformGenerateCodeController } from './platform-generate-code.controller';
import { PlatformGenerateCodeService } from './platform-generate-code.service';
import { TeamInvitationEntity, TeamMemberEntity } from '../team/team.entity';
import { PlatformAuditLogsController } from './platform-audit-logs.controller';
import { PlatformAuditLogsService } from './platform-audit-logs.service';
import { PlatformManageCodesController } from './platform-manage-codes.controller';
import { PlatformManageCodesService } from './platform-manage-codes.service';
import { PlatformReportsController } from './platform-reports.controller';
import { PlatformReportsService } from './platform-reports.service';
import { PlatformTeamController } from './platform-team.controller';
import { PlatformTeamService } from './platform-team.service';

@Module({
  imports: [
    CodesModule,
    CommerceModule,
    OperationsModule,
    TypeOrmModule.forFeature([
      AuditLogEntity,
      CodeBatchEntity,
      VerificationCodeEntity,
      VerificationEventEntity,
      OrganizationEntity,
      ProductEntity,
      UserEntity,
      TeamMemberEntity,
      TeamInvitationEntity,
    ]),
  ],
  controllers: [
    PlatformManageCodesController,
    PlatformAuditLogsController,
    PlatformReportsController,
    PlatformTeamController,
    PlatformGenerateCodeController,
    PlatformDashboardController,
  ],
  providers: [
    PlatformManageCodesService,
    PlatformAuditLogsService,
    PlatformReportsService,
    PlatformTeamService,
    PlatformGenerateCodeService,
    PlatformDashboardService,
  ],
})
export class PlatformModule {}
