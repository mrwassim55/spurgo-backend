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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto, @Request() req) {
    return this.notificationsService.create(createNotificationDto, req.user.id);
  }

  // Admin: push a message to every active user of a role (or everyone).
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/broadcast')
  broadcast(@Body('audience') audience: string, @Body('title') title: string, @Body('message') message: string) {
    return this.notificationsService.broadcast(audience, title, message);
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
