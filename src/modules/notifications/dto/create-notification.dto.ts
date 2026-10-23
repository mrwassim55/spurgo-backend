import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @IsOptional()
  requestId?: string;

  @IsString()
  @IsOptional()
  offerId?: string;

  @IsString()
  @IsOptional()
  message?: string;
}
