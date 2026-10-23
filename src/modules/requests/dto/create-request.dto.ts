import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateRequestDto {
  @IsNotEmpty()
  @IsString()
  vehicleType: string;

  @IsNotEmpty()
  @IsString()
  manufactureCountry: string;

  @IsNotEmpty()
  @IsString()
  vehicleYear: string;

  @IsNotEmpty()
  @IsString()
  vehicleBrand: string;

  @IsNotEmpty()
  @IsString()
  vehicleModel: string;

  @IsNotEmpty()
  @IsString()
  vehicleEngine: string;

  @IsNotEmpty()
  @IsString()
  fuelType: string;

  @IsNotEmpty()
  @IsString()
  category: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  vehicleImageUrl?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
