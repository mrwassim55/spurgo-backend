import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InAppPopup, PopupTargetPage, PopupTargetRole } from './entities/popup.entity';

@Injectable()
export class PopupsService {
  constructor(
    @InjectRepository(InAppPopup)
    private popupsRepo: Repository<InAppPopup>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPopupsIfEmpty();
  }

  private async seedDefaultPopupsIfEmpty() {
    const count = await this.popupsRepo.count();
    if (count > 0) return;

    const defaults: Partial<InAppPopup>[] = [
      {
        titleAr: 'مرحباً بك في سبورجو! 🚗',
        titleEn: 'Welcome to Spurgo! 🚗',
        messageAr: 'استفد من التجربة المجانية خلال ساعات العمل (10:00 - 16:00) لتجربة كشف المتاجر وطلب القطع مجاناً.',
        messageEn: 'Enjoy the 4-hour operating free trial (10:00 - 16:00) to search and unlock store offers for free.',
        targetPage: 'home',
        targetRole: 'customer',
        type: 'reward',
        icon: 'gift',
        buttonTextAr: 'ابدأ البحث الآن',
        buttonTextEn: 'Start Searching',
        buttonAction: 'route',
        buttonRoute: '/requests',
        isActive: true,
      },
      {
        titleAr: 'البحث الذكي بالصور متاح الآن! 📸',
        titleEn: 'Smart Photo Search Available! 📸',
        messageAr: 'يمكنك الآن إرفاق صورة واضحة لقطعة الغيار ليتمكن الموردون ومندوب سبورجو من مطابقتها وتوفيرها لك بسرعة فائقة.',
        messageEn: 'You can now attach clear photos of requested parts so suppliers and market reps can match them instantly.',
        targetPage: 'create_request',
        targetRole: 'all',
        type: 'promo',
        icon: 'sparkles',
        buttonTextAr: 'فهمت',
        buttonTextEn: 'Got it',
        buttonAction: 'dismiss',
        buttonRoute: '',
        isActive: true,
      },
      {
        titleAr: 'تنبيه للمتاجر: سارع بالرد لكسب النقاط! ⭐',
        titleEn: 'Store Alert: Respond quickly to earn points! ⭐',
        messageAr: 'كل رد سريع أو قبول للطلب يمنح متجرك نقاطاً ومكافآت لرفع تصنيفك وأولويتك في شبكة سبورجو.',
        messageEn: 'Every fast quote or acceptance awards points that boost your store priority in the Spurgo network.',
        targetPage: 'all',
        targetRole: 'supplier',
        type: 'alert',
        icon: 'star',
        buttonTextAr: 'عرض الطلبات النشطة',
        buttonTextEn: 'View Demands',
        buttonAction: 'route',
        buttonRoute: '/demands',
        isActive: true,
      },
    ];

    for (const p of defaults) {
      await this.popupsRepo.save(this.popupsRepo.create(p));
    }
  }

  async findAllAdmin(): Promise<InAppPopup[]> {
    return this.popupsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<InAppPopup> {
    const popup = await this.popupsRepo.findOne({ where: { id } });
    if (!popup) throw new NotFoundException(`Popup with ID ${id} not found`);
    return popup;
  }

  async create(data: Partial<InAppPopup>): Promise<InAppPopup> {
    const popup = this.popupsRepo.create({
      ...data,
      targetPage: data.targetPage || PopupTargetPage.ALL,
      targetRole: data.targetRole || PopupTargetRole.ALL,
      isActive: data.isActive !== undefined ? data.isActive : true,
    });
    return this.popupsRepo.save(popup);
  }

  async update(id: string, data: Partial<InAppPopup>): Promise<InAppPopup> {
    const popup = await this.findOne(id);
    Object.assign(popup, data);
    return this.popupsRepo.save(popup);
  }

  async delete(id: string): Promise<void> {
    const popup = await this.findOne(id);
    await this.popupsRepo.remove(popup);
  }

  async toggleActive(id: string): Promise<InAppPopup> {
    const popup = await this.findOne(id);
    popup.isActive = !popup.isActive;
    return this.popupsRepo.save(popup);
  }

  async findActiveForUser(page: string, role?: string): Promise<InAppPopup | null> {
    const targetPages = [page];
    if (page !== 'all') targetPages.push('all');

    const targetRoles = ['all'];
    if (role && role !== 'all') targetRoles.push(role);

    const popup = await this.popupsRepo.findOne({
      where: {
        isActive: true,
        targetPage: In(targetPages),
        targetRole: In(targetRoles),
      },
      order: { createdAt: 'DESC' },
    });

    if (popup) {
      // Increment views count asynchronously
      this.popupsRepo.increment({ id: popup.id }, 'viewsCount', 1).catch(() => {});
    }

    return popup;
  }

  async recordClick(id: string): Promise<void> {
    await this.popupsRepo.increment({ id }, 'clicksCount', 1).catch(() => {});
  }
}
