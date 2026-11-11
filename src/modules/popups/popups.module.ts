import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InAppPopup } from './entities/popup.entity';
import { PopupsService } from './popups.service';
import { PopupsController } from './popups.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InAppPopup])],
  controllers: [PopupsController],
  providers: [PopupsService],
  exports: [PopupsService],
})
export class PopupsModule {}

