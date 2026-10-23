import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';

@Controller('upload')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    try {
      const result = await this.cloudinaryService.uploadFile(file);
      return {
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
      };
    } catch (error) {
      console.warn('Cloudinary upload failed/unconfigured, using local file storage fallback:', error?.message || error);
      const localUrl = await this.cloudinaryService.saveFileLocally(file);
      return {
        url: localUrl,
        publicId: 'local',
        bytes: file.size,
        format: file.mimetype ? file.mimetype.split('/')[1] : 'jpg',
      };
    }
  }
}
