import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class ProblemDetailsDto {
  @ApiProperty({ example: 'https://api.goverifeye.com/problems/request_error' }) type!: string;
  @ApiProperty({ example: 'Request validation failed' }) title!: string;
  @ApiProperty({ example: 400 }) status!: number;
  @ApiProperty({ example: 'REQUEST_ERROR' }) code!: string;
  @ApiProperty({ example: '/api/v1/products' }) instance!: string;
  @ApiProperty({ format: 'uuid' }) correlationId!: string;
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }) detail?: string | string[];
}

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) pageSize!: number;
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty() hasPreviousPage!: boolean;
  @ApiPropertyOptional() sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) sortDirection?: string;
}

export const problemExample = (status: number, code: string, title: string) => ({
  type: `https://api.goverifeye.com/problems/${code.toLowerCase()}`,
  title,
  status,
  code,
  instance: '/api/v1/resource',
  correlationId: '4cc7d09a-e394-43f7-8627-bf12ccae0cab',
});

export function ApiProtectedEndpoint() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiExtraModels(ProblemDetailsDto),
    ApiBadRequestResponse({ description: 'Malformed or invalid request', type: ProblemDetailsDto }),
    ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired access token', type: ProblemDetailsDto }),
    ApiForbiddenResponse({ description: 'Authenticated user lacks the required role', type: ProblemDetailsDto }),
    ApiTooManyRequestsResponse({ description: 'Request rate limit exceeded', type: ProblemDetailsDto }),
    ApiInternalServerErrorResponse({ description: 'Unexpected server error', type: ProblemDetailsDto }),
  );
}

export function ApiPublicEndpoint() {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ApiBadRequestResponse({ description: 'Malformed or invalid request', type: ProblemDetailsDto }),
    ApiTooManyRequestsResponse({ description: 'Request rate limit exceeded', type: ProblemDetailsDto }),
    ApiInternalServerErrorResponse({ description: 'Unexpected server error', type: ProblemDetailsDto }),
  );
}

export function ApiDomainNotFound(code: string, title: string) {
  return ApiNotFoundResponse({
    description: title,
    content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) }, example: problemExample(404, code, title) } },
  });
}

export function ApiDomainConflict(code: string, title: string) {
  return ApiResponse({
    status: 409,
    description: title,
    content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) }, example: problemExample(409, code, title) } },
  });
}

export function paginatedSchema(model: Type<unknown>) {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: { $ref: getSchemaPath(model) } },
      meta: { $ref: getSchemaPath(PageMetaDto) },
    },
  };
}
