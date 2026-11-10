import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { Offer } from './entities/offer.entity';
import { ContactUnlock } from './entities/contact-unlock.entity';
import { AccessoryRequest } from '../requests/entities/accessory-request.entity';
import { User } from '../users/entities/user.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { PaymentPlan } from '../payments/entities/payment-plan.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { RequestsModule } from '../requests/requests.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, ContactUnlock, AccessoryRequest, User, PaymentTransaction, PaymentPlan]),
    NotificationsModule,
    UsersModule,
    RequestsModule,
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
