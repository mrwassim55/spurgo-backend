import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, ILike } from 'typeorm';
import { MarketplaceItem } from './entities/marketplace-item.entity';
import { MarketplaceInquiry } from './entities/marketplace-inquiry.entity';
import { CreateMarketplaceItemDto, UpdateMarketplaceItemDto, CreateInquiryDto } from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceItem)
    private readonly itemRepo: Repository<MarketplaceItem>,
    @InjectRepository(MarketplaceInquiry)
    private readonly inquiryRepo: Repository<MarketplaceInquiry>,
  ) {}

  async onModuleInit() {
    await this.seedInitialPiecesIfEmpty();
  }

  async findAll(query: {
    search?: string;
    make?: string;
    category?: string;
    condition?: string;
    isAvailable?: string | boolean;
    isFeatured?: string | boolean;
    page?: number;
    limit?: number;
    sortBy?: 'priceAsc' | 'priceDesc' | 'newest';
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.itemRepo.createQueryBuilder('item');

    if (query.isAvailable !== undefined && query.isAvailable !== '') {
      const avail = query.isAvailable === true || query.isAvailable === 'true';
      qb.andWhere('item.isAvailable = :isAvailable', { isAvailable: avail });
    }

    if (query.isFeatured !== undefined && query.isFeatured !== '') {
      const feat = query.isFeatured === true || query.isFeatured === 'true';
      qb.andWhere('item.isFeatured = :isFeatured', { isFeatured: feat });
    }

    if (query.make && query.make !== 'الكل' && query.make !== 'all') {
      qb.andWhere('LOWER(item.make) = LOWER(:make)', { make: query.make });
    }

    if (query.category && query.category !== 'الكل' && query.category !== 'all') {
      qb.andWhere('item.category = :category', { category: query.category });
    }

    if (query.condition && query.condition !== 'الكل' && query.condition !== 'all') {
      qb.andWhere('item.condition = :condition', { condition: query.condition });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(item.titleAr) LIKE :term OR LOWER(item.titleEn) LIKE :term OR LOWER(item.partNumber) LIKE :term OR LOWER(item.make) LIKE :term OR LOWER(item.model) LIKE :term OR LOWER(item.description) LIKE :term)',
        { term },
      );
    }

    if (query.sortBy === 'priceAsc') {
      qb.orderBy('item.price', 'ASC');
    } else if (query.sortBy === 'priceDesc') {
      qb.orderBy('item.price', 'DESC');
    } else {
      qb.orderBy('item.isFeatured', 'DESC').addOrderBy('item.createdAt', 'DESC');
    }

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  async getFeatured() {
    return this.itemRepo.find({
      where: { isAvailable: true, isFeatured: true },
      order: { createdAt: 'DESC' },
      take: 8,
    });
  }

  async findById(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Marketplace item with id ${id} not found`);
    }
    // Increment view count asynchronously
    this.itemRepo.increment({ id }, 'viewsCount', 1).catch(() => {});
    return item;
  }

  async create(dto: CreateMarketplaceItemDto) {
    const item = this.itemRepo.create({
      ...dto,
      currency: dto.currency || 'LYD',
      isAvailable: dto.isAvailable !== undefined ? dto.isAvailable : true,
      isFeatured: dto.isFeatured || false,
      images: Array.isArray(dto.images) ? dto.images : [],
    });
    return this.itemRepo.save(item);
  }

  async update(id: string, dto: UpdateMarketplaceItemDto) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Marketplace item with id ${id} not found`);
    }
    Object.assign(item, dto);
    if (dto.images) {
      item.images = Array.isArray(dto.images) ? dto.images : [];
    }
    return this.itemRepo.save(item);
  }

  async delete(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Marketplace item with id ${id} not found`);
    }
    await this.itemRepo.remove(item);
    return { success: true, message: 'Item deleted successfully' };
  }

  async toggleAvailability(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Marketplace item with id ${id} not found`);
    }
    item.isAvailable = !item.isAvailable;
    return this.itemRepo.save(item);
  }

  async toggleFeatured(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Marketplace item with id ${id} not found`);
    }
    item.isFeatured = !item.isFeatured;
    return this.itemRepo.save(item);
  }

  async createInquiry(dto: CreateInquiryDto, userId?: string) {
    const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
    if (!item) {
      throw new NotFoundException('Marketplace piece not found');
    }
    const inquiry = this.inquiryRepo.create({
      item,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      city: dto.city || 'طرابلس',
      notes: dto.notes || '',
      userId: userId || undefined,
      status: 'pending',
    });
    return this.inquiryRepo.save(inquiry);
  }

  async getInquiries(status?: string) {
    const where: FindOptionsWhere<MarketplaceInquiry> = {};
    if (status) {
      where.status = status;
    }
    return this.inquiryRepo.find({
      where,
      relations: ['item'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateInquiryStatus(id: string, status: string) {
    const inquiry = await this.inquiryRepo.findOne({ where: { id } });
    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }
    inquiry.status = status;
    return this.inquiryRepo.save(inquiry);
  }

  async getCategories() {
    return [
      'قطع المحرك',
      'نظام المكابح',
      'نظام التعليق والمساعدات',
      'الهيكل الخارجي والإنارة',
      'نظام الكهرباء والإلكترونيات',
      'فلاتر وزيوت وسوائل',
      'نظام التبريد والتكييف',
      'كماليات وإكسسوارات',
    ];
  }

  async getMakes() {
    const items = await this.itemRepo.find({ select: ['make'] });
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.make && i.make !== 'الكل') set.add(i.make);
    });
    const defaultMakes = ['Toyota', 'Hyundai', 'Mercedes', 'BMW', 'Volkswagen', 'Kia', 'Nissan'];
    defaultMakes.forEach((m) => set.add(m));
    return Array.from(set);
  }

  private async seedInitialPiecesIfEmpty() {
    try {
      const count = await this.itemRepo.count();
      if (count > 0) return;

      const initialPieces: Partial<MarketplaceItem>[] = [
        {
          titleAr: 'فحمات فرامل أمامية أصلية سيراميك',
          titleEn: 'OEM Front Ceramic Brake Pads',
          partNumber: '04465-33471',
          make: 'Toyota',
          model: 'Camry / Avalon',
          yearStart: 2018,
          yearEnd: 2024,
          category: 'نظام المكابح',
          condition: 'oem',
          price: 180,
          originalPrice: 220,
          currency: 'LYD',
          stockQuantity: 8,
          isAvailable: true,
          isFeatured: true,
          description: 'طقم تيل فرامل أمامي أصلي وكالة مصنوع من السيراميك عالي الأداء، يوفر قوة كبح ممتازة وبدون أصوات أو غبار زائد، متوافق تماماً مع تويوتا كامري وأفالون 2018-2024.',
          images: [
            'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80',
          ],
          city: 'طرابلس',
          contactPhone: '+218910000001',
          contactWhatsapp: '+218910000001',
        },
        {
          titleAr: 'كمبروسر مكيف هواء أصلي جديد',
          titleEn: 'AC Compressor Assembly OEM',
          partNumber: '97701-C1000',
          make: 'Hyundai',
          model: 'Sonata / Elantra',
          yearStart: 2017,
          yearEnd: 2023,
          category: 'نظام التبريد والتكييف',
          condition: 'new',
          price: 850,
          originalPrice: 950,
          currency: 'LYD',
          stockQuantity: 3,
          isAvailable: true,
          isFeatured: true,
          description: 'ضاغط مكيف هواء جديد أصلي عالي الجودة مع البكرة والكلاتش، تبريد قوي جداً ومثالي للأجواء الصيفية الحارة في ليبيا.',
          images: [
            'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=800&q=80',
          ],
          city: 'طرابلس',
          contactPhone: '+218910000001',
          contactWhatsapp: '+218910000001',
        },
        {
          titleAr: 'طقم مساعدات هيدروليك خلفي ألماني',
          titleEn: 'Rear Hydraulic Shock Absorber Set',
          partNumber: '33526796155',
          make: 'BMW',
          model: '3 Series (F30) / 4 Series',
          yearStart: 2013,
          yearEnd: 2019,
          category: 'نظام التعليق والمساعدات',
          condition: 'new',
          price: 520,
          originalPrice: 600,
          currency: 'LYD',
          stockQuantity: 4,
          isAvailable: true,
          isFeatured: true,
          description: 'مساعدات خلفية يمين ويسار من تصنيع شركة Sachs الألمانية الأصلية، ثبات فائق على المنعطفات وراحة تامة على الطرق غير المستوية.',
          images: [
            'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80',
          ],
          city: 'بنغازي',
          contactPhone: '+218910000001',
          contactWhatsapp: '+218910000001',
        },
        {
          titleAr: 'طقم شمعات احتراق ليزر إيريديوم (4 قطع)',
          titleEn: 'Laser Iridium Spark Plugs Set of 4',
          partNumber: 'ILZKAR7A10',
          make: 'Nissan',
          model: 'Altima / Rogue / X-Trail',
          yearStart: 2014,
          yearEnd: 2022,
          category: 'قطع المحرك',
          condition: 'oem',
          price: 130,
          originalPrice: 160,
          currency: 'LYD',
          stockQuantity: 15,
          isAvailable: true,
          isFeatured: false,
          description: 'بواجي احتراق أصلية NGK Laser Iridium تمنح استجابة فورية لعزم المحرك وتوفيراً ملحوظاً في استهلاك الوقود وعمراً افتراضياً يتجاوز 100,000 كم.',
          images: [
            'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80',
          ],
          city: 'مصراتة',
          contactPhone: '+218910000001',
          contactWhatsapp: '+218910000001',
        },
        {
          titleAr: 'مصباح أمامي LED كامل أصلي (جهة اليمين)',
          titleEn: 'Right Front LED Headlight Assembly',
          partNumber: 'A2059067802',
          make: 'Mercedes',
          model: 'C-Class (W205)',
          yearStart: 2019,
          yearEnd: 2022,
          category: 'الهيكل الخارجي والإنارة',
          condition: 'used',
          price: 1400,
          originalPrice: 1700,
          currency: 'LYD',
          stockQuantity: 2,
          isAvailable: true,
          isFeatured: true,
          description: 'فانوس أمامي أصلي High Performance LED بحالة ممتازة كالجديد بدون أي خدوش أو كسور، جميع القواعد سليمة 100%.',
          images: [
            'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80',
          ],
          city: 'طرابلس',
          contactPhone: '+218910000001',
          contactWhatsapp: '+218910000001',
        },
      ];

      for (const piece of initialPieces) {
        await this.itemRepo.save(this.itemRepo.create(piece));
      }
      this.logger.log('Seeded 5 initial marketplace pieces successfully.');
    } catch (e: any) {
      this.logger.warn(`Marketplace initial seed skipped: ${e.message}`);
    }
  }
}
