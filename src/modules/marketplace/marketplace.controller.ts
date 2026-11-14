import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MarketplaceService } from './marketplace.service';
import { CreateMarketplaceItemDto, UpdateMarketplaceItemDto, CreateInquiryDto } from './dto/marketplace.dto';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Public Endpoints (App & Users) ──────────────────────────────────────────

  @Get('items')
  async getPublicItems(@Query() query: any) {
    return this.marketplaceService.findAll({
      ...query,
      isAvailable: query.isAvailable !== undefined ? query.isAvailable : true,
    });
  }

  @Get('featured')
  async getFeaturedItems() {
    return this.marketplaceService.getFeatured();
  }

  @Get('categories')
  async getCategories() {
    return this.marketplaceService.getCategories();
  }

  @Get('makes')
  async getMakes() {
    return this.marketplaceService.getMakes();
  }

  @Get('items/:id')
  async getItemDetails(@Param('id') id: string) {
    return this.marketplaceService.findById(id);
  }

  @Post('inquire')
  async submitInquiry(@Body() dto: CreateInquiryDto, @Request() req: any) {
    const userId = req?.user?.id || null;
    return this.marketplaceService.createInquiry(dto, userId);
  }

  // ── Admin Endpoints (Admin Dashboard) ───────────────────────────────────────

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('admin/items')
  async getAdminItems(@Query() query: any) {
    return this.marketplaceService.findAll(query);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('admin/items')
  async createItem(@Body() dto: CreateMarketplaceItemDto) {
    return this.marketplaceService.create(dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('admin/items/:id')
  async updateItem(@Param('id') id: string, @Body() dto: UpdateMarketplaceItemDto) {
    return this.marketplaceService.update(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/items/:id')
  async deleteItem(@Param('id') id: string) {
    return this.marketplaceService.delete(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('admin/items/:id/toggle-availability')
  async toggleAvailability(@Param('id') id: string) {
    return this.marketplaceService.toggleAvailability(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('admin/items/:id/toggle-featured')
  async toggleFeatured(@Param('id') id: string) {
    return this.marketplaceService.toggleFeatured(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('admin/items/:id/notify')
  async notifyItem(@Param('id') id: string) {
    return this.marketplaceService.notifyProduct(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('admin/inquiries')
  async getInquiries(@Query('status') status?: string) {
    return this.marketplaceService.getInquiries(status);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Patch('admin/inquiries/:id/status')
  async updateInquiryStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.marketplaceService.updateInquiryStatus(id, status);
  }
}

