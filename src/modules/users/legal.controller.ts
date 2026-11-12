import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { LegalService } from './legal.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('privacy-policy')
  async getPrivacyPolicy() {
    return this.legalService.getPrivacyPolicy();
  }

  @Get('terms-of-service')
  async getTermsOfService() {
    return this.legalService.getTermsOfService();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  async getAllForAdmin() {
    return this.legalService.getAllForAdmin();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/update')
  async updateLegal(@Body() body: any) {
    return this.legalService.updateLegal(body);
  }
}
