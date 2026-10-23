import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { RequestsModule } from './modules/requests/requests.module';
import { OffersModule } from './modules/offers/offers.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { UsersModule } from './modules/users/users.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (url) {
          return {
            type: 'postgres',
            url: url,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true,
            ssl: {
              rejectUnauthorized: false,
            },
          };
        }

        const dbHost = process.env.DB_HOST;
        const dbPort = process.env.DB_PORT;
        const dbUser = process.env.DB_USERNAME;
        const dbPass = process.env.DB_PASSWORD;
        const dbName = process.env.DB_DATABASE;

        if (dbHost && dbUser && dbPass && dbName) {
          return {
            type: 'postgres',
            host: dbHost,
            port: dbPort ? parseInt(dbPort, 10) : 5432,
            username: dbUser,
            password: dbPass,
            database: dbName,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true,
          };
        }

        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'FATAL: DATABASE_URL environment variable is required in production mode.',
          );
        }
        return {
          type: 'sqlite',
          database: process.env.DATABASE_PATH || 'spurgo.db',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
        };
      },
    }),
    AuthModule,
    RequestsModule,
    OffersModule,
    CloudinaryModule,
    UsersModule,
    NotificationsModule,
    ReportsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
