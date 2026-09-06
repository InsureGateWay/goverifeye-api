import { Body, Controller, INestApplication, Post, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { configureRequestBodyParsers } from './request-body-parsers';

@Controller()
class BodyEchoController {
  @Post(['customer/checks', 'customer/concerns', 'auth/login'])
  echo(@Body() body: unknown) { return body; }
}

describe('request body parsing', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [BodyEchoController] }).compile();
    app = module.createNestApplication({ logger: false });
    configureRequestBodyParsers(app, 'api');
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it.each(['customer/checks', 'auth/login'])('parses JSON for %s', async path => {
    const body = { verificationCode: '0000000000000000', requestId: '22222222-2222-4222-8222-222222222222' };
    await request(app.getHttpServer()).post('/api/v1/' + path).send(body).expect(201, body);
  });
  it('accepts a photo-sized JSON body on concerns', async () => {
    const body = { photo: 'a'.repeat(200000) };
    await request(app.getHttpServer()).post('/api/v1/customer/concerns').send(body).expect(201, body);
  });
  it('preserves the normal body limit on other endpoints', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ value: 'a'.repeat(200000) }).expect(413);
  });
});
