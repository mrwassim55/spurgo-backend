import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
  BadRequestException,
  Param,
  Query,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { isTrialActive } from './rules';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    const user = await this.usersService.findById(req.user.id);
    const settings = await this.usersService.getSettings();
    const { password: _, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      trialActiveNow: isTrialActive(user.trialEndsAt, settings),
      shopOpenHour: settings.shopOpenHour,
      shopCloseHour: settings.shopCloseHour,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('points/history')
  async getPointsHistory(@Request() req) {
    return this.usersService.getPointsHistory(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('fcm-token')
  async updateFcmToken(@Request() req, @Body('fcmToken') fcmToken: string) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    await this.usersService.updateFcmToken(req.user.id, fcmToken);
    return { success: true, message: 'FCM token updated successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  async updateProfile(@Request() req, @Body() updateData: any) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    const user = await this.usersService.updateProfile(req.user.id, updateData);
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('points/add')
  async addPoints(@Request() req, @Body('amount') amount: number) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    if (amount === undefined || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }
    const user = await this.usersService.addPoints(req.user.id, amount);
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Get('admin/users')
  async getAllUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const { data, total } = await this.usersService.findPaginated(
      pageNum,
      limitNum,
      search,
      role,
    );
    return {
      total,
      page: pageNum,
      limit: limitNum,
      users: data.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }),
    };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/stats')
  async getStats(@Query('days') days?: string) {
    return this.usersService.getSystemStats(parseInt(days ?? '14', 10));
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/points-config')
  async getPointsConfig() {
    return this.usersService.getSettings();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/points-config')
  async updatePointsConfig(@Body() body: Record<string, any>) {
    return this.usersService.updateSettings(body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Post('admin/users/:id/points')
  async updatePoints(@Param('id') id: string, @Body('points') points: number) {
    if (points === undefined || points < 0) {
      throw new BadRequestException('Points must be a positive number');
    }
    const user = await this.usersService.updatePoints(id, points);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Get('admin/users/:id/points-history')
  async getUserPointsHistory(@Param('id') id: string) {
    return this.usersService.getPointsHistory(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/users/create')
  async createAdminCreatedUser(@Body() body: any) {
    const { email, password, fullName, role } = body;
    if (!email || !password || !fullName || !role) {
      throw new BadRequestException(
        'Email, password, fullName, and role are required',
      );
    }
    if (role !== UserRole.MODERATOR && role !== UserRole.STAFF) {
      throw new BadRequestException('Role must be either moderator or staff');
    }
    const user = await this.usersService.createAdminCreatedUser(body);
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/matches')
  async getMatches() {
    return this.usersService.getMatches();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/users/:id/role')
  async updateRole(@Param('id') id: string, @Body('role') role: string) {
    if (!role) {
      throw new BadRequestException('Role is required');
    }
    const roleVal = role.toLowerCase().trim() as UserRole;
    if (
      roleVal !== UserRole.CUSTOMER &&
      roleVal !== UserRole.SUPPLIER &&
      roleVal !== UserRole.ADMIN &&
      roleVal !== UserRole.MODERATOR &&
      roleVal !== UserRole.STAFF
    ) {
      throw new BadRequestException('Invalid role specified');
    }
    const user = await this.usersService.updateRole(id, roleVal);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/matches/:id')
  async deleteMatch(@Param('id') id: string) {
    await this.usersService.deleteMatch(id);
    return { success: true, message: 'Match deleted successfully' };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/matches/:id/assign')
  async assignMatch(
    @Param('id') id: string,
    @Body('moderatorId') moderatorId: string,
  ) {
    await this.usersService.assignMatch(id, moderatorId || null);
    return { success: true, message: 'Match verification assignment updated' };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/moderators')
  async getModerators() {
    const mods = await this.usersService.getModerators();
    return mods.map((user) => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.MODERATOR)
  @Get('moderator/matches')
  async getModeratorMatches(@Request() req) {
    return this.usersService.getMatchesForModerator(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.STAFF)
  @Get('staff/matches')
  async getStaffMatches() {
    return this.usersService.getMatches();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/users/:id/active')
  async toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    if (isActive === undefined) {
      throw new BadRequestException('isActive must be boolean');
    }
    const user = await this.usersService.toggleUserActive(id, isActive);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @Get('admin/notifications')
  async getAdminNotifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (page !== undefined || limit !== undefined) {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;
      return this.usersService.getAdminNotificationsPaginated(
        pageNum,
        limitNum,
      );
    }
    return this.usersService.getAdminNotifications();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @Post('admin/notifications/read-all')
  async markAllRead() {
    await this.usersService.markAllAdminNotificationsRead();
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('supplier-documents')
  @UseInterceptors(FilesInterceptor('documents', 3, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadSupplierDocuments(
    @Request() req,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('verificationDocuments') bodyDocs?: string[],
  ) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    let documentUrls: string[] = [];

    if (bodyDocs && Array.isArray(bodyDocs) && bodyDocs.length > 0) {
      documentUrls = bodyDocs;
    } else if (files && files.length > 0) {
      for (const file of files) {
        try {
          const result = await this.cloudinaryService.uploadFile(file);
          documentUrls.push(result.secure_url);
        } catch (error) {
          console.warn('Cloudinary upload failed/unconfigured, using local file storage fallback:', error?.message || error);
          const localUrl = await this.cloudinaryService.saveFileLocally(file);
          documentUrls.push(localUrl);
        }
      }
    } else {
      throw new BadRequestException('At least one document file or URL is required');
    }

    const user = await this.usersService.uploadSupplierDocuments(req.user.id, documentUrls);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Get('admin/pending-suppliers')
  async getPendingSuppliers() {
    const suppliers = await this.usersService.getPendingSuppliers();
    return suppliers.map((user) => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Get('pending-suppliers')
  async getPendingSuppliersAlias() {
    return this.getPendingSuppliers();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Patch('admin/approve-supplier/:id')
  async approveSupplier(@Param('id') id: string) {
    const user = await this.usersService.approveSupplier(id);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Patch('approve-supplier/:id')
  async approveSupplierAlias(@Param('id') id: string) {
    return this.approveSupplier(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Patch('admin/reject-supplier/:id')
  async rejectSupplier(@Param('id') id: string) {
    const user = await this.usersService.rejectSupplier(id);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.STAFF)
  @Patch('reject-supplier/:id')
  async rejectSupplierAlias(@Param('id') id: string) {
    return this.rejectSupplier(id);
  }
}
