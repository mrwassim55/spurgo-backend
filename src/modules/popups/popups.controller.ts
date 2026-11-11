import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PopupsService } from './popups.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('popups')
export class PopupsController {
  constructor(private readonly popupsService: PopupsService) {}

  // Mobile In-App check: Public or authenticated
  @Get('active')
  getActive(@Query('page') page: string, @Query('role') role?: string) {
    return this.popupsService.findActiveForUser(page || 'all', role);
  }

  // Click tracking
  @Post(':id/click')
  recordClick(@Param('id') id: string) {
    return this.popupsService.recordClick(id);
  }

  // Admin Management Endpoints
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  findAllAdmin() {
    return this.popupsService.findAllAdmin();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.popupsService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  createAdmin(@Body() body: any) {
    return this.popupsService.create(body);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('admin/:id')
  updateAdmin(@Param('id') id: string, @Body() body: any) {
    return this.popupsService.update(id, body);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  deleteAdmin(@Param('id') id: string) {
    return this.popupsService.delete(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/toggle')
  toggleAdmin(@Param('id') id: string) {
    return this.popupsService.toggleActive(id);
  }
}
