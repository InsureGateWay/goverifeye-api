import { OpenAPIObject } from '@nestjs/swagger';

type ResponseObject = { description: string; content?: Record<string, unknown> };
type OperationObject = { operationId?: string; summary?: string; security?: unknown[]; responses: Record<string, ResponseObject> };
type PathItemObject = Partial<Record<'get' | 'put' | 'post' | 'delete' | 'patch' | 'options' | 'head', OperationObject>>;

const problemResponse = (status: number, description: string, code: string): ResponseObject => ({
  description,
  content: {
    'application/problem+json': {
      schema: { $ref: '#/components/schemas/ProblemDetailsDto' },
      example: {
        type: `https://api.goverifeye.com/problems/${code.toLowerCase()}`,
        title: description,
        status,
        code,
        instance: '/api/v1/resource',
        correlationId: '4cc7d09a-e394-43f7-8627-bf12ccae0cab',
      },
    },
  },
});

const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

export function enrichOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ProblemDetailsDto ??= {
    type: 'object',
    required: ['type', 'title', 'status', 'code', 'instance', 'correlationId'],
    properties: {
      type: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      status: { type: 'integer' },
      code: { type: 'string' },
      instance: { type: 'string' },
      correlationId: { type: 'string', format: 'uuid' },
      detail: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    },
  };
  document.components.schemas.ResponsePayloadDto ??= {
    type: 'object',
    description: 'Endpoint-specific response payload. Endpoints with a concrete response model override this schema.',
    additionalProperties: true,
  };

  for (const pathItem of Object.values(document.paths) as PathItemObject[]) {
    for (const method of methods) {
      const operation = pathItem[method] as OperationObject | undefined;
      if (!operation) continue;
      const secured = Boolean(operation.security?.length);
      if (!operation.summary && operation.operationId) {
        operation.summary = operation.operationId
          .replace(/Controller_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/^./, (character) => character.toUpperCase());
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (/^2\d\d$/.test(status) && status !== '204' && !response.content) {
          response.content = { 'application/json': { schema: { $ref: '#/components/schemas/ResponsePayloadDto' } } };
        }
      }
      operation.responses['400'] ??= problemResponse(400, 'Malformed or invalid request', 'REQUEST_ERROR');
      if (secured) {
        operation.responses['401'] ??= problemResponse(401, 'Missing, invalid, or expired access token', 'UNAUTHORIZED');
        operation.responses['403'] ??= problemResponse(403, 'Authenticated user lacks the required role', 'FORBIDDEN');
      }
      operation.responses['429'] ??= problemResponse(429, 'Request rate limit exceeded', 'RATE_LIMITED');
      operation.responses['500'] ??= problemResponse(500, 'Unexpected server error', 'INTERNAL_ERROR');
    }
  }
  return document;
}
