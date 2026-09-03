import { Module } from '@nestjs/common'; import { JwtModule } from '@nestjs/jwt'; import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller'; import { AuthService } from './auth.service';
import { AuthSessionEntity, OtpEntity, PasswordResetChallengeEntity, UserEntity } from './auth.entity';
import { JwtStrategy } from './jwt.strategy';
import { OperationsModule } from '../operations/operations.module';
import { GovernanceModule } from '../governance/governance.module';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
@Module({ imports: [TypeOrmModule.forFeature([UserEntity, OtpEntity,AuthSessionEntity,PasswordResetChallengeEntity,OrganizationEntity]), OperationsModule, GovernanceModule, JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: '15m' } }) })], controllers: [AuthController], providers: [AuthService, JwtStrategy] })
export class AuthModule {}
