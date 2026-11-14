export class CreateMarketplaceItemDto {
  titleAr: string;
  titleEn?: string;
  partNumber?: string;
  make?: string;
  model?: string;
  yearStart?: number;
  yearEnd?: number;
  category?: string;
  condition?: string;
  price: number;
  originalPrice?: number;
  currency?: string;
  stockQuantity?: number;
  isAvailable?: boolean;
  isFeatured?: boolean;
  description?: string;
  images?: string[];
  city?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
}

export class UpdateMarketplaceItemDto {
  titleAr?: string;
  titleEn?: string;
  partNumber?: string;
  make?: string;
  model?: string;
  yearStart?: number;
  yearEnd?: number;
  category?: string;
  condition?: string;
  price?: number;
  originalPrice?: number;
  currency?: string;
  stockQuantity?: number;
  isAvailable?: boolean;
  isFeatured?: boolean;
  description?: string;
  images?: string[];
  city?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
}

export class CreateInquiryDto {
  itemId: string;
  customerName: string;
  customerPhone: string;
  city?: string;
  notes?: string;
}

