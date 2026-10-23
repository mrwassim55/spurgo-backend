import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { AccessoryRequest } from './entities/accessory-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccessoryRequest])],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
