import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { SystemConfig } from './entities/system-config.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { PointsEntry } from './entities/points-entry.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SystemConfig, AdminNotification, PointsEntry]),
    CloudinaryModule,
  ],
  providers: [UsersService, LegalService],
  controllers: [UsersController, LegalController],
  exports: [UsersService, LegalService],
})
export class UsersModule {}
