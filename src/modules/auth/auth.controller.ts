import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private cloudinaryService: CloudinaryService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() registrationData: any) {
    return this.authService.register(registrationData);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginData: any) {
    return this.authService.login(loginData);
  }

  @Post('verify-otp')
  async verifyOtp(@Body('email') email: string, @Body('code') code: string) {
    return this.authService.verifyOtp(email, code);
  }

  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(@Body('email') email: string, @Body('code') code: string) {
    return this.authService.verifyResetOtp(email, code);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetData: any) {
    return this.authService.resetPassword(resetData);
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

  @UseGuards(AuthGuard('jwt'))
  @Get('admin/pending-suppliers')
  async getPendingSuppliers() {
    const suppliers = await this.usersService.getPendingSuppliers();
    return suppliers.map((user) => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('pending-suppliers')
  async getPendingSuppliersAlias() {
    return this.getPendingSuppliers();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('admin/approve-supplier/:id')
  async approveSupplierPatch(@Param('id') id: string) {
    return this.approveSupplierPost(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/approve-supplier/:id')
  async approveSupplierPost(@Param('id') id: string) {
    const user = await this.usersService.approveSupplier(id);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('admin/reject-supplier/:id')
  async rejectSupplierPatch(@Param('id') id: string) {
    return this.rejectSupplierPost(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/reject-supplier/:id')
  async rejectSupplierPost(@Param('id') id: string) {
    const user = await this.usersService.rejectSupplier(id);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

