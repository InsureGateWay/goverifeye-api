import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'crypto'; import type { NextFunction,Request,Response } from 'express';
import { AppModule } from './app.module';
import type { AppOptions } from './config/app.config';
import { enrichOpenApiDocument } from './common/openapi-document';
import { StructuredLoggerService } from './common/structured-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new StructuredLoggerService());
  const options = app.get(ConfigService).getOrThrow<AppOptions>('app');
  app.use(helmet());
  app.use((request:Request,response:Response,next:NextFunction)=>{const correlationId=String(request.headers['x-correlation-id']??randomUUID());request.headers['x-correlation-id']=correlationId;response.setHeader('x-correlation-id',correlationId);next();});
  app.enableCors({ origin: options.corsOrigins, credentials: true });
  app.setGlobalPrefix(options.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const swagger = new DocumentBuilder().setTitle('goVerifEye API').setVersion('1.0').addBearerAuth().build();
  const openApiDocument = enrichOpenApiDocument(SwaggerModule.createDocument(app, swagger));
  SwaggerModule.setup('docs', app, openApiDocument);
  app.enableShutdownHooks();
  await app.listen(options.port);
}
void bootstrap().catch((error: unknown) => {
  new StructuredLoggerService().fatal({
    event: 'application.bootstrap.failed',
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exitCode = 1;
});
