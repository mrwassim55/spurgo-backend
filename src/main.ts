import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const dbPath = process.env.DATABASE_PATH || 'spurgo.db';
  const dbDir = path.dirname(dbPath);
  if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' }); // base64 photos for /ai/analyze-part
  // Serve static uploaded files locally
  const express = require('express');
  app.use('/uploads', express.static(uploadsDir));

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    // Applies @Exclude() (e.g. User.password) to every entity returned by a controller.
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}/api`);
}
bootstrap();
