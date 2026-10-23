import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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

  const app = await NestFactory.create(AppModule);
  // Serve static uploaded files locally
  const express = require('express');
  app.use('/uploads', express.static(uploadsDir));

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
