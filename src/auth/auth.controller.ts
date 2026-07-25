import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { AuthService } from './auth.service'; import { ActionResponseDto, CurrentUserResponseDto, LoginDto, OtpChallengeResponseDto, OtpVerifiedResponseDto, RefreshDto, RegisterDto, RequestOtpDto, SessionQueryDto, SessionResponseDto, TokenResponseDto, VerifyOtpDto } from './dto/auth.dto'; import { CurrentUser, RequestContext } from '../common/request-context'; import { Delete,Param,Query } from '@nestjs/common';
import { Public } from './public.decorator';
import { Throttle } from '@nestjs/throttler';
import { ApiProtectedEndpoint, ApiPublicEndpoint, PageMetaDto } from '../common/swagger.dto';
@ApiTags('auth') @ApiExtraModels(SessionResponseDto,PageMetaDto) @Controller('auth') export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @ApiPublicEndpoint() @ApiOperation({summary:'Request an email verification code'}) @ApiCreatedResponse({type:OtpChallengeResponseDto}) @Throttle({default:{limit:5,ttl:60000}}) @Post('otp/request') request(@Body() dto: RequestOtpDto) { return this.auth.requestOtp(dto.email); }
  @Public() @ApiPublicEndpoint() @ApiOperation({summary:'Verify an email verification code'}) @ApiOkResponse({type:OtpVerifiedResponseDto}) @Throttle({default:{limit:10,ttl:60000}}) @Post('otp/verify') @HttpCode(200) verify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.email, dto.code); }
  @Public() @ApiPublicEndpoint() @ApiOperation({summary:'Register an account after email verification'}) @ApiCreatedResponse({type:TokenResponseDto}) @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto.registrationToken, dto.password); }
  @Public() @ApiPublicEndpoint() @ApiOperation({summary:'Sign in with email and password'}) @ApiOkResponse({type:TokenResponseDto}) @Throttle({default:{limit:10,ttl:60000}}) @Post('login') @HttpCode(200) login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }
  @Public() @ApiPublicEndpoint() @ApiOperation({summary:'Rotate an access and refresh token pair'}) @ApiOkResponse({type:TokenResponseDto}) @Post('refresh') @HttpCode(200) refresh(@Body()dto:RefreshDto){return this.auth.refresh(dto.refreshToken)}
  @ApiProtectedEndpoint() @ApiOperation({summary:'Sign out the current session'}) @ApiOkResponse({type:ActionResponseDto}) @Post('logout') @HttpCode(200) logout(@CurrentUser()u:RequestContext){return this.auth.logout(u.userId,u.organizationId,u.sessionId)}
  @ApiProtectedEndpoint() @ApiOperation({summary:'Sign out all sessions'}) @ApiOkResponse({type:ActionResponseDto}) @Post('logout-all') @HttpCode(200) logoutAll(@CurrentUser()u:RequestContext){return this.auth.logoutAll(u.userId,u.organizationId)}
  @ApiProtectedEndpoint() @ApiOperation({summary:'Get the authenticated user'}) @ApiOkResponse({type:CurrentUserResponseDto}) @Get('me') me(@CurrentUser()u:RequestContext){return this.auth.me(u.userId,u.organizationId)}
  @ApiProtectedEndpoint() @ApiOperation({summary:'List the authenticated user sessions'}) @ApiOkResponse({schema:{type:'object',properties:{data:{type:'array',items:{$ref:getSchemaPath(SessionResponseDto)}},meta:{$ref:getSchemaPath(PageMetaDto)}}}}) @Get('sessions') sessions(@CurrentUser()u:RequestContext,@Query()q:SessionQueryDto){return this.auth.listSessions(u.userId,u.organizationId,q)}
  @ApiProtectedEndpoint() @ApiOperation({summary:'Revoke a session'}) @ApiOkResponse({type:ActionResponseDto}) @Delete('sessions/:id') revoke(@CurrentUser()u:RequestContext,@Param('id')id:string){return this.auth.revokeSession(u.userId,u.organizationId,id)}
}
