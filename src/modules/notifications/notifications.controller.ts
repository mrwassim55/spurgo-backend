import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto, @Request() req) {
    return this.notificationsService.create(createNotificationDto, req.user.id);
  }

  @Get()
  findAll(@Request() req, @Query('type') type?: string) {
    return this.notificationsService.findAll(req.user.id, type);
  }

  @Put(':id/accept')
  acceptMatch(@Param('id') id: string, @Request() req) {
    return this.notificationsService.acceptMatch(id, req.user.id);
  }

  @Put(':id/decline')
  declineMatch(@Param('id') id: string, @Request() req) {
    return this.notificationsService.declineMatch(id, req.user.id);
  }
}
