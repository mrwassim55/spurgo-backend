import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultsIfEmpty();
  }

  // Public: returns active categories sorted by displayOrder
  async findAll(scope?: string) {
    const qb = this.categoryRepo.createQueryBuilder('c')
      .where('c.isActive = :isActive', { isActive: true });

    if (scope && scope !== 'all') {
      qb.andWhere('(c.scope = :scope OR c.scope = :allScope)', { scope, allScope: 'all' });
    }

    return qb.orderBy('c.displayOrder', 'ASC').addOrderBy('c.createdAt', 'ASC').getMany();
  }

  // Admin: returns all categories including inactive
  async findAllAdmin() {
    return this.categoryRepo.find({
      order: {
        displayOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
  }

  async findOne(id: string) {
    const cat = await this.categoryRepo.findOne({ where: { id } });
    if (!cat) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug || this.generateSlug(dto.nameEn || dto.nameAr);
    const category = this.categoryRepo.create({
      ...dto,
      slug,
      icon: dto.icon || 'fa-cogs',
      scope: dto.scope || 'all',
      displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : 0,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });
    return this.categoryRepo.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    if (dto.nameEn && !dto.slug) {
      dto.slug = this.generateSlug(dto.nameEn);
    }
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    await this.categoryRepo.remove(category);
    return { success: true, message: 'Category removed successfully' };
  }

  async toggle(id: string) {
    const category = await this.findOne(id);
    category.isActive = !category.isActive;
    return this.categoryRepo.save(category);
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u0621-\u064A]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async seedDefaultsIfEmpty() {
    try {
      const count = await this.categoryRepo.count();
      if (count > 0) return;

      this.logger.log('Seeding initial categories for Spurgo marketplace and requests...');

      const defaultCategories: Partial<Category>[] = [
        {
          nameAr: 'قطع المحرك',
          nameEn: 'Engine Parts',
          slug: 'engine-parts',
          icon: 'fa-gear',
          scope: 'all',
          displayOrder: 1,
          isActive: true,
        },
        {
          nameAr: 'نظام المكابح',
          nameEn: 'Brake System',
          slug: 'brake-system',
          icon: 'fa-circle-stop',
          scope: 'all',
          displayOrder: 2,
          isActive: true,
        },
        {
          nameAr: 'نظام التعليق والمساعدات',
          nameEn: 'Suspension',
          slug: 'suspension',
          icon: 'fa-arrows-up-down',
          scope: 'all',
          displayOrder: 3,
          isActive: true,
        },
        {
          nameAr: 'الهيكل الخارجي والإنارة',
          nameEn: 'Body Parts',
          slug: 'body-parts',
          icon: 'fa-car-side',
          scope: 'all',
          displayOrder: 4,
          isActive: true,
        },
        {
          nameAr: 'الكهرباء والإلكترونيات',
          nameEn: 'Electrical',
          slug: 'electrical',
          icon: 'fa-bolt',
          scope: 'all',
          displayOrder: 5,
          isActive: true,
        },
        {
          nameAr: 'ناقل الحركة والدوران',
          nameEn: 'Transmission',
          slug: 'transmission',
          icon: 'fa-cogs',
          scope: 'all',
          displayOrder: 6,
          isActive: true,
        },
        {
          nameAr: 'نظام التبريد والتكييف',
          nameEn: 'Cooling & AC',
          slug: 'cooling-ac',
          icon: 'fa-snowflake',
          scope: 'all',
          displayOrder: 7,
          isActive: true,
        },
        {
          nameAr: 'فلاتر وزيوت وسوائل',
          nameEn: 'Filters & Fluids',
          slug: 'filters-fluids',
          icon: 'fa-oil-can',
          scope: 'all',
          displayOrder: 8,
          isActive: true,
        },
        {
          nameAr: 'كماليات وإكسسوارات',
          nameEn: 'Accessories',
          slug: 'accessories',
          icon: 'fa-gem',
          scope: 'all',
          displayOrder: 9,
          isActive: true,
        },
        {
          nameAr: 'إطارات وجنوط',
          nameEn: 'Wheels & Tires',
          slug: 'wheels-tires',
          icon: 'fa-circle-notch',
          scope: 'all',
          displayOrder: 10,
          isActive: true,
        },
      ];

      for (const item of defaultCategories) {
        const cat = this.categoryRepo.create(item);
        await this.categoryRepo.save(cat);
      }

      this.logger.log(`Seeded ${defaultCategories.length} default categories successfully.`);
    } catch (err) {
      this.logger.error('Error seeding default categories', err);
    }
  }
}

