import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { SystemConfig } from './entities/system-config.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SystemConfig, AdminNotification]),
    CloudinaryModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
