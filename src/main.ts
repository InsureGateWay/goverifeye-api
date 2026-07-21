import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'crypto'; import type { NextFunction,Request,Response } from 'express';
import { AppModule } from './app.module';
import type { AppOptions } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const options = app.get(ConfigService).getOrThrow<AppOptions>('app');
  app.use(helmet());
  app.use((request:Request,response:Response,next:NextFunction)=>{const correlationId=String(request.headers['x-correlation-id']??randomUUID());request.headers['x-correlation-id']=correlationId;response.setHeader('x-correlation-id',correlationId);next();});
  app.enableCors({ origin: options.corsOrigins, credentials: true });
  app.setGlobalPrefix(options.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const swagger = new DocumentBuilder().setTitle('goVerifEye API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  app.enableShutdownHooks();
  await app.listen(options.port);
}
void bootstrap();
