import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class CloudinaryService {
  async uploadFile(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      throw new Error('Cloudinary credentials unconfigured');
    }
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder: 'spurgo', resource_type: 'auto' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );
      Readable.from(file.buffer).pipe(upload);
    });
  }

  async saveFileLocally(file: Express.Multer.File): Promise<string> {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileExt = path.extname(file.originalname || '') || '.jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${fileExt}`;
    const filePath = path.join(uploadsDir, filename);

    await fs.promises.writeFile(filePath, file.buffer);
    return `/uploads/${filename}`;
  }
}
