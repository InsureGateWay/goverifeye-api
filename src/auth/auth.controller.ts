import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service'; import { LoginDto, RefreshDto, RegisterDto, RequestOtpDto, SessionQueryDto, VerifyOtpDto } from './dto/auth.dto'; import { CurrentUser, RequestContext } from '../common/request-context'; import { Delete,Param,Query } from '@nestjs/common';
import { Public } from './public.decorator';
import { Throttle } from '@nestjs/throttler';
@ApiTags('auth') @Controller('auth') export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Throttle({default:{limit:5,ttl:60000}}) @Post('otp/request') request(@Body() dto: RequestOtpDto) { return this.auth.requestOtp(dto.email); }
  @Public() @Throttle({default:{limit:10,ttl:60000}}) @Post('otp/verify') @HttpCode(200) verify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.email, dto.code); }
  @Public() @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto.registrationToken, dto.password); }
  @Public() @Throttle({default:{limit:10,ttl:60000}}) @Post('login') @HttpCode(200) login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }
  @Public() @Post('refresh') @HttpCode(200) refresh(@Body()dto:RefreshDto){return this.auth.refresh(dto.refreshToken)}
  @Post('logout') @HttpCode(200) logout(@CurrentUser()u:RequestContext){return this.auth.logout(u.userId,u.organizationId,u.sessionId)}
  @Post('logout-all') @HttpCode(200) logoutAll(@CurrentUser()u:RequestContext){return this.auth.logoutAll(u.userId,u.organizationId)}
  @Get('me') me(@CurrentUser()u:RequestContext){return this.auth.me(u.userId,u.organizationId)}
  @Get('sessions') sessions(@CurrentUser()u:RequestContext,@Query()q:SessionQueryDto){return this.auth.listSessions(u.userId,u.organizationId,q)}
  @Delete('sessions/:id') revoke(@CurrentUser()u:RequestContext,@Param('id')id:string){return this.auth.revokeSession(u.userId,u.organizationId,id)}
}
