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
  app.disable('x-powered-by');
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.useBodyParser('json', { limit: '10mb' }); // base64 photos for /ai/analyze-part
  // Serve static uploaded files locally
  const express = require('express');
  app.use('/uploads', express.static(uploadsDir));

  // Serve the compiled Angular Admin Dashboard if available
  const adminDistDir = path.join(process.cwd(), 'admin-dist');
  if (fs.existsSync(adminDistDir)) {
    app.use(express.static(adminDistDir));
  }

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    // Applies @Exclude() (e.g. User.password) to every entity returned by a controller.
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // SPA fallback for HTML5 history API (Angular router)
  if (fs.existsSync(adminDistDir)) {
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
        const indexPath = path.join(adminDistDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          return res.sendFile(indexPath);
        }
      }
      next();
    });
  }
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}/api`);
}
bootstrap();
