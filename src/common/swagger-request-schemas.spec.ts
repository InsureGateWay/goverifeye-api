import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { LoginDto, RefreshDto, RegisterDto, RequestOtpDto, VerifyOtpDto } from '../auth/dto/auth.dto';
import { GenerateBatchDto, VerifyProductCodeDto } from '../codes/code.dto';
import { CreateExportJobDto, CreatePaymentDto, CreateSupportTicketDto, QuoteDto, UpdateSupportTicketDto } from '../commerce/commerce.dto';
import { CompleteOnboardingDto, CreateDocumentDto, UpdateAddressDto, UpdateAdministratorDto, UpdateCompanyOnboardingDto, UpdateDocumentDto } from '../onboarding/onboarding.dto';
import { ChangePasswordDto, UpdateCompanyDto, UpdateProfileDto } from '../operations/operations.dto';
import { ReviewDecisionDto } from '../approvals/approval.dto';
import { CreateProductDto, UpdateProductDto } from '../products/dto/product.dto';
import { AcceptInvitationDto, InviteMemberDto, UpdateMemberDto } from '../team/team.dto';

const requestDtos: Type<unknown>[] = [
  RequestOtpDto, VerifyOtpDto, RegisterDto, LoginDto, RefreshDto,
  GenerateBatchDto, VerifyProductCodeDto,
  QuoteDto, CreatePaymentDto, CreateExportJobDto, CreateSupportTicketDto, UpdateSupportTicketDto,
  CompleteOnboardingDto, UpdateAddressDto, UpdateAdministratorDto, UpdateCompanyOnboardingDto, CreateDocumentDto, UpdateDocumentDto,
  ReviewDecisionDto, CreateProductDto, UpdateProductDto,
  UpdateCompanyDto, ChangePasswordDto, UpdateProfileDto,
  AcceptInvitationDto, InviteMemberDto, UpdateMemberDto,
];

describe('Swagger request schemas', () => {
  it.each(requestDtos)('%s exposes at least one documented request property', (dto) => {
    const documentedProperties = Reflect.getMetadata('swagger/apiModelPropertiesArray', dto.prototype) as string[] | undefined;
    expect(documentedProperties ?? []).not.toHaveLength(0);
  });
});
