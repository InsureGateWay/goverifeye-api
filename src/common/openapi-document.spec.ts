import { OpenAPIObject } from '@nestjs/swagger';
import { enrichOpenApiDocument } from './openapi-document';

describe('enrichOpenApiDocument', () => {
  it('adds success schemas and distinct standard problem responses', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/products': {
          get: {
            operationId: 'ProductController_list',
            security: [{ bearer: [] }],
            responses: { 200: { description: 'Success' } },
          },
        },
      },
      components: {},
    } as unknown as OpenAPIObject;

    const result = enrichOpenApiDocument(document);
    const operation = result.paths['/products']!.get!;
    expect(operation.summary).toBe('Product list');
    expect(operation.responses['200']).toHaveProperty('content.application/json.schema.$ref', '#/components/schemas/ResponsePayloadDto');
    expect(operation.responses).toEqual(expect.objectContaining({
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object),
      503: expect.any(Object),
    }));
    expect(operation.responses['401']).toHaveProperty('content.application/problem+json.example.code', 'UNAUTHORIZED');
  });
});
