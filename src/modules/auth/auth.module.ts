import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { SystemConfig } from '../users/entities/system-config.entity';
import { AdminNotification } from '../users/entities/admin-notification.entity';
import { EmailVerification } from '../users/entities/email-verification.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      SystemConfig,
      AdminNotification,
      EmailVerification,
    ]),
    PassportModule,
    CloudinaryModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, MailService, SmsService],
  controllers: [AuthController],
  exports: [AuthService, SmsService],
})
export class AuthModule {}
