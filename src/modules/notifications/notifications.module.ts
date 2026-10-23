import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { AccessoryRequest } from '../requests/entities/accessory-request.entity';
import { Offer } from '../offers/entities/offer.entity';

import { FcmService } from './fcm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, AccessoryRequest, Offer]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmService],
  exports: [NotificationsService, FcmService],
})
export class NotificationsModule {}
