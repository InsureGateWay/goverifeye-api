import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Public } from '../auth/public.decorator';
import { ConcernBody, CustomerCheckBody, CustomerHistoryQuery, SharedCheckBody, ShopperChallengeBody, ShopperLoginBody } from './customer.dto';
import type { CustomerCheckDto } from './customer.contract';
import { CustomerService } from './customer.service';

// Shopper tokens are opaque and validated by CustomerService. Vendor JWTs cannot authenticate these routes.
@Public() @ApiTags('customer') @Controller('customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}
  @Post('auth/challenge') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } })
  challenge(@Body() input: ShopperChallengeBody) { return this.service.requestLogin(input.email); }
  @Post('auth/login') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() input: ShopperLoginBody) { return this.service.login(input.challengeId, input.code); }
  @Get('auth/me') async me(@Headers('authorization') auth?: string) { const shopper = await this.service.shopper(auth); return { id: shopper!.id, email: shopper!.email }; }
  @Post('auth/logout') @HttpCode(200) logout(@Headers('authorization') auth?: string) { return this.service.logout(auth); }
  @Post('checks') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60000 } })
  check(@Body() input: CustomerCheckBody, @Req() request: Request) { return this.service.check(input, request.get('authorization'), { ip: request.ip, userAgent: request.get('user-agent') }); }
  @Get('checks/:receipt') details(@Param('receipt') receipt: string) { return this.service.details(receipt); }
  @Get('shared/:receipt') async shared(@Param('receipt') receipt: string, @Res() response: Response) {
    this.render(await this.service.details(receipt), response);
  }
  @Post('shared/:receipt') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async recheck(@Param('receipt') receipt: string, @Body() input: SharedCheckBody, @Req() request: Request, @Res() response: Response) {
    const previous = await this.service.details(receipt);
    const check = await this.service.check({ verificationCode: previous.code, requestId: input.requestId, channel: 'manual' }, undefined, { ip: request.ip, userAgent: request.get('user-agent') });
    this.render(check, response);
  }
  private render(check: CustomerCheckDto, response: Response) {
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>goVerifEye check</title><body><main><h1>goVerifEye check</h1><p>Code: ${escape(check.code)}</p><p>Recorded status: <strong>${escape(check.result.status.replace(/_/g, ' '))}</strong></p>${check.result.product ? `<p>Product: ${escape(check.result.product.name)}</p>` : ''}<p>Checked: ${escape(check.checkedAt)}</p><p>This is a recorded result. Status can change. A code check does not certify product quality or safety.</p><form method="post"><input type="hidden" name="requestId" value="${randomUUID()}"><button type="submit">Get current status</button></form></main></body></html>`);
  }
  @Get('history') history(@Headers('authorization') auth: string | undefined, @Query() query: CustomerHistoryQuery) { return this.service.history(auth, query.page); }
  @Post('concerns') @Throttle({ default: { limit: 5, ttl: 60000 } })
  report(@Body() input: ConcernBody) { return this.service.report(input); }
}
