import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { PlatformGenerateBatchDto } from './platform-generate-code.dto';
import { PlatformGenerateCodeService } from './platform-generate-code.service';

@ApiTags('platform-generate-code')
@ApiBearerAuth()
@Roles(UserRole.PlatformAdmin)
@Controller('platform/generate-code')
export class PlatformGenerateCodeController {
  constructor(private readonly service: PlatformGenerateCodeService) {}

  @Get('vendors')
  listVendors(@Query('query') query?: string, @Query('search') search?: string) {
    return this.service.listVendors(query ?? search ?? '');
  }

  @Post('batches')
  createBatch(
    @CurrentUser() user: RequestContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PlatformGenerateBatchDto,
  ) {
    const key =
      idempotencyKey && idempotencyKey.length >= 8
        ? idempotencyKey
        : randomUUID();
    return this.service.createBatch(user.userId, dto, key);
  }
}
