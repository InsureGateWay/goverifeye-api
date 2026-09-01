const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'docs', 'goverifeye-production-openapi.json');
const outputPath = path.join(root, 'docs', 'goverifeye-production.postman_collection.json');
const document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const methods = ['get', 'post', 'put', 'patch', 'delete'];

const variableNames = {
  id: 'resourceId',
  claimId: 'claimId',
  token: 'invitationToken',
};

function resolveSchema(schema, seen = new Set(), propertyName = '') {
  if (!schema) return undefined;
  const managedVariables = {
    email: '{{email}}', password: '{{password}}', newPassword: '{{newPassword}}',
    refreshToken: '{{refreshToken}}', challengeId: '{{challengeId}}',
    registrationToken: '{{registrationToken}}', token: '{{invitationToken}}',
    code: '{{otp}}', productId: '{{productId}}', organizationId: '{{organizationId}}',
  };
  if (managedVariables[propertyName]) return managedVariables[propertyName];
  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1);
    if (seen.has(name)) return {};
    return resolveSchema(document.components?.schemas?.[name], new Set([...seen, name]));
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.oneOf?.length) return resolveSchema(schema.oneOf[0], seen);
  if (schema.anyOf?.length) return resolveSchema(schema.anyOf[0], seen);
  if (schema.allOf?.length) return Object.assign({}, ...schema.allOf.map((item) => resolveSchema(item, seen) ?? {}));
  if (schema.type === 'array') return [resolveSchema(schema.items, seen)];
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, resolveSchema(value, seen, key)]),
    );
  }
  if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
  if (schema.format === 'date-time') return new Date(0).toISOString();
  if (schema.format === 'date') return '2026-01-01';
  if (schema.format === 'email') return '{{email}}';
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  return schema.example ?? 'string';
}

function pathVariable(name) {
  return variableNames[name] ?? `${name}`;
}

function buildItem(route, method, operation, pathLevel) {
  const parameters = [...(pathLevel.parameters ?? []), ...(operation.parameters ?? [])];
  const renderedPath = route.replace(/{([^}]+)}/g, (_, name) => `{{${pathVariable(name)}}}`);
  const query = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => ({
      key: parameter.name,
      value: String(parameter.example ?? parameter.schema?.default ?? parameter.schema?.example ?? ''),
      description: parameter.description,
      disabled: !parameter.required,
    }));
  const headers = parameters
    .filter((parameter) => parameter.in === 'header')
    .map((parameter) => ({
      key: parameter.name,
      value: parameter.name.toLowerCase() === 'idempotency-key' ? '{{$guid}}' : String(parameter.example ?? ''),
      description: parameter.description,
      disabled: !parameter.required,
    }));
  const content = operation.requestBody?.content ?? {};
  const mediaType = content['application/json'] ? 'application/json' : Object.keys(content)[0];
  const request = {
    method: method.toUpperCase(),
    header: headers,
    url: {
      raw: `{{baseUrl}}${renderedPath}${query.length ? `?${query.map((entry) => `${entry.key}=${entry.value}`).join('&')}` : ''}`,
      host: ['{{baseUrl}}'],
      path: renderedPath.split('/').filter(Boolean),
      query,
    },
    description: operation.description ?? operation.summary ?? '',
  };
  if (mediaType) {
    request.header.push({ key: 'Content-Type', value: mediaType });
    const example = content[mediaType]?.example ?? resolveSchema(content[mediaType]?.schema);
    request.body = mediaType === 'application/json'
      ? { mode: 'raw', raw: JSON.stringify(example ?? {}, null, 2), options: { raw: { language: 'json' } } }
      : { mode: 'raw', raw: '' };
  }
  if (operation.security === undefined || operation.security.length === 0) request.auth = { type: 'noauth' };

  const tests = [
    "pm.test('Response status is documented', function () {",
    `  pm.expect(${JSON.stringify(Object.keys(operation.responses ?? {}))}).to.include(String(pm.response.code));`,
    '});',
    "pm.test('Response time is below 10 seconds', function () { pm.expect(pm.response.responseTime).to.be.below(10000); });",
  ];
  const operationName = operation.operationId ?? '';
  if (/login$/i.test(operationName) || route.endsWith('/auth/login')) {
    tests.push(
      'if (pm.response.code >= 200 && pm.response.code < 300) {',
      '  const json = pm.response.json(); const value = json.data ?? json;',
      "  if (value.accessToken) pm.collectionVariables.set('accessToken', value.accessToken);",
      "  if (value.refreshToken) pm.collectionVariables.set('refreshToken', value.refreshToken);",
      "  if (value.user?.id) pm.collectionVariables.set('userId', value.user.id);",
      "  if (value.user?.organizationId) pm.collectionVariables.set('organizationId', value.user.organizationId);",
      '}',
    );
  }
  if (route.endsWith('/auth/otp/request')) {
    tests.push("if (pm.response.code < 300) { const v = pm.response.json().data ?? pm.response.json(); if (v.challengeId) pm.collectionVariables.set('challengeId', v.challengeId); }");
  }
  return {
    name: operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${route}`,
    request,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }],
  };
}

const folders = new Map();
for (const [route, pathLevel] of Object.entries(document.paths)) {
  for (const method of methods) {
    const operation = pathLevel[method];
    if (!operation) continue;
    const tag = operation.tags?.[0] ?? 'Other';
    if (!folders.has(tag)) folders.set(tag, []);
    folders.get(tag).push(buildItem(route, method, operation, pathLevel));
  }
}

const variables = [
  ['baseUrl', 'https://goverifeye-api.onrender.com/api/v1'],
  ['email', 'senorleo12@yahoo.com'], ['password', ''], ['newPassword', ''],
  ['accessToken', ''], ['refreshToken', ''], ['otp', ''], ['challengeId', ''],
  ['registrationToken', ''], ['invitationToken', ''], ['resourceId', ''],
  ['userId', ''], ['organizationId', ''], ['productId', ''], ['batchId', ''],
  ['codeId', ''], ['claimId', ''], ['paymentId', ''], ['jobId', ''],
  ['ticketId', ''], ['templateId', ''], ['optionId', ''], ['fraudAlertId', ''],
  ['incidentId', ''], ['changeRequestId', ''], ['approvalId', ''], ['invitationId', ''],
].map(([key, value]) => ({ key, value, type: ['password', 'newPassword', 'accessToken', 'refreshToken', 'otp'].includes(key) ? 'secret' : 'default' }));

const collection = {
  info: {
    name: 'goVerifEye API - Production',
    description: `Generated from the deployed OpenAPI contract. Swagger: https://goverifeye-api.onrender.com/docs\n\nSet the secret password locally in Postman; it is intentionally not stored in this file. Login captures access and refresh tokens automatically. Requests inherit bearer authentication unless the OpenAPI operation is public.`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  variable: variables,
  event: [{
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: [
        "if (!pm.collectionVariables.get('baseUrl')) pm.collectionVariables.set('baseUrl', 'https://goverifeye-api.onrender.com/api/v1');",
      ],
    },
  }],
  item: [...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => ({ name, item })),
};

fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Generated ${outputPath} with ${[...folders.values()].flat().length} requests in ${folders.size} folders.`);
