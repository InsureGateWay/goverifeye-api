import { Module } from '@nestjs/common'; import { ConfigModule, ConfigService } from '@nestjs/config'; import { APP_FILTER,APP_GUARD,APP_INTERCEPTOR } from '@nestjs/core'; import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config'; import codeGenerationConfig from './config/code-generation.config'; import databaseConfig, { DatabaseOptions } from './config/database.config'; import { validateEnvironment } from './config/env.validation'; import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module'; import { CodesModule } from './codes/codes.module'; import { OnboardingModule } from './onboarding/onboarding.module'; import { ProductModule } from './products/product.module'; import { ReportingModule } from './reporting/reporting.module'; import { TeamModule } from './team/team.module';
import { OperationsModule } from './operations/operations.module';
import { CommerceModule } from './commerce/commerce.module';
import { ApprovalModule } from './approvals/approval.module';
import { PlatformModule } from './platform/platform.module';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ThrottlerGuard,ThrottlerModule } from '@nestjs/throttler';
import { AuditInterceptor } from './operations/audit.interceptor';
import { JwtAuthGuard } from './auth/jwt-auth.guard'; import { RolesGuard } from './auth/authorization';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { OrganizationActivationGuard } from './common/organization-activation.guard';
import { InvitationEligibilityGuard } from './team/invitation-eligibility.guard';
import { OnboardingWriteGuard } from './onboarding/onboarding-write.guard';
import { GovernanceModule } from './governance/governance.module';
import { PlatformAdminSeedController } from './database/platform-admin-seed.controller';
import { StorageBootstrapService } from './common/storage-bootstrap.service';
import { PendingAccountGuard } from './common/pending-account.guard';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, envFilePath: ['.env.local', '.env'], load: [appConfig, databaseConfig, codeGenerationConfig], validate: validateEnvironment }),ThrottlerModule.forRoot([{ttl:60000,limit:100}]), TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => config.getOrThrow<DatabaseOptions>('database') }), AuthModule, OnboardingModule, ProductModule, CodesModule, TeamModule, ReportingModule, OperationsModule,CommerceModule,ApprovalModule,PlatformModule,GovernanceModule], controllers: [HealthController,PlatformAdminSeedController], providers: [StorageBootstrapService,{ provide: APP_GUARD, useClass: ThrottlerGuard },{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard },{ provide: APP_GUARD, useClass: PendingAccountGuard },{ provide: APP_GUARD, useClass: OrganizationActivationGuard },{ provide: APP_GUARD, useClass: InvitationEligibilityGuard },{ provide: APP_GUARD, useClass: OnboardingWriteGuard },{provide:APP_FILTER,useClass:DomainErrorFilter},{provide:APP_INTERCEPTOR,useClass:RequestLoggingInterceptor},{provide:APP_INTERCEPTOR,useClass:AuditInterceptor}] })
export class AppModule {}
