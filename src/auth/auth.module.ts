import { Module } from '@nestjs/common'; import { JwtModule } from '@nestjs/jwt'; import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller'; import { AuthService } from './auth.service';
import { AuthSessionEntity, OtpEntity, UserEntity } from './auth.entity';
import { JwtStrategy } from './jwt.strategy';
@Module({ imports: [TypeOrmModule.forFeature([UserEntity, OtpEntity,AuthSessionEntity]), JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: '15m' } }) })], controllers: [AuthController], providers: [AuthService, JwtStrategy] })
export class AuthModule {}
