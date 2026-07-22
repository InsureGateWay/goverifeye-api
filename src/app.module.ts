import { Module } from '@nestjs/common'; import { ConfigModule, ConfigService } from '@nestjs/config'; import { APP_FILTER,APP_GUARD,APP_INTERCEPTOR } from '@nestjs/core'; import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config'; import codeGenerationConfig from './config/code-generation.config'; import databaseConfig, { DatabaseOptions } from './config/database.config'; import { validateEnvironment } from './config/env.validation'; import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module'; import { CodesModule } from './codes/codes.module'; import { OnboardingModule } from './onboarding/onboarding.module'; import { ProductModule } from './products/product.module'; import { ReportingModule } from './reporting/reporting.module'; import { TeamModule } from './team/team.module';
import { OperationsModule } from './operations/operations.module';
import { CommerceModule } from './commerce/commerce.module';
import { ApprovalModule } from './approvals/approval.module';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ThrottlerGuard,ThrottlerModule } from '@nestjs/throttler';
import { AuditInterceptor } from './operations/audit.interceptor';
import { JwtAuthGuard } from './auth/jwt-auth.guard'; import { RolesGuard } from './auth/authorization';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, load: [appConfig, databaseConfig, codeGenerationConfig], validate: validateEnvironment }),ThrottlerModule.forRoot([{ttl:60000,limit:100}]), TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => config.getOrThrow<DatabaseOptions>('database') }), AuthModule, OnboardingModule, ProductModule, CodesModule, TeamModule, ReportingModule, OperationsModule,CommerceModule,ApprovalModule], controllers: [HealthController], providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard },{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard },{provide:APP_FILTER,useClass:DomainErrorFilter},{provide:APP_INTERCEPTOR,useClass:AuditInterceptor}] })
export class AppModule {}
