import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  async createReport(
    @Request() req,
    @Body('targetType') targetType: string,
    @Body('targetId') targetId: string,
    @Body('description') description?: string,
  ) {
    const userId = req.user?.id || null;
    return this.reportsService.create(
      userId,
      targetType,
      targetId,
      description,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get()
  async getReports() {
    return this.reportsService.findAll();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Delete(':id')
  async deleteReportedItem(@Param('id') id: string) {
    await this.reportsService.deleteReportedItem(id);
    return { success: true, message: 'Reported item deleted cleanly' };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Delete(':id/dismiss')
  async dismissReport(@Param('id') id: string) {
    await this.reportsService.dismissReport(id);
    return { success: true, message: 'Report dismissed successfully' };
  }
}
