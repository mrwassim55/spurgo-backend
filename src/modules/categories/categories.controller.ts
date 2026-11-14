import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ── Public Endpoints (Mobile App & Public Views) ───────────────────────────

  @Get()
  async getCategories(@Query('scope') scope?: string) {
    return this.categoriesService.findAll(scope);
  }

  // ── Admin Protected Endpoints ──────────────────────────────────────────────

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  async getAllAdmin() {
    return this.categoriesService.findAllAdmin();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('admin/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  async remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/toggle')
  async toggle(@Param('id') id: string) {
    return this.categoriesService.toggle(id);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }
}
