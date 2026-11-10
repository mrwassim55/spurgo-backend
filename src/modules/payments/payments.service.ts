import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  PaymentTransaction,
  PaymentStatus,
} from './entities/payment-transaction.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepository: Repository<PaymentTransaction>,
    @InjectRepository(PaymentPlan)
    private readonly planRepository: Repository<PaymentPlan>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlansIfNeeded();
    await this.seedSearchPlansIfMissing();
    if (process.env.NODE_ENV === 'production' && !this.payNetToken) {
      this.logger.warn('PAY_NET_BEARER_TOKEN is not set: payment webhooks are trusted without verification!');
    }
  }

  // Normal / smart search (client doc §2). The difference must be clear to the user before payment.
  private async seedSearchPlansIfMissing() {
    const plans = [
      {
        planId: 'search_normal',
        nameEn: 'Normal search',
        nameAr: 'البحث العادي',
        price: 10,
        sortOrder: 1,
        featuresEn: [
          'Unlock the store details of one offer',
          'Search direct marketplace listings',
          'Suitable for common and readily available parts',
        ],
        featuresAr: [
          'إظهار بيانات المتجر والتواصل المباشر لعرض واحد',
          'البحث في العروض المباشرة والمخزون المتاح',
          'مناسب للقطع الشائعة والمتوفرة بكثرة',
        ],
      },
      {
        planId: 'search_smart',
        nameEn: 'Smart search',
        nameAr: 'البحث الذكي',
        price: 20,
        sortOrder: 2,
        isPopular: true,
        featuresEn: [
          'Unlock the store details of one offer',
          'Advanced compatibility matching across store network',
          'Priority store alerts and fast response',
          'Ideal for rare or specific parts',
        ],
        featuresAr: [
          'إظهار بيانات المتجر والتواصل المباشر لعرض واحد',
          'مطابقة ذكية متقدمة مع شبكة المتاجر وتدقيق التوافق',
          'أولوية إرسال وتنبيه المتاجر وسرعة الردود',
          'مناسب للقطع النادرة التي تتطلب دقة عالية',
        ],
      },
    ];
    try {
      for (const plan of plans) {
        const existing = await this.planRepository.findOne({ where: { planId: plan.planId } });
        if (!existing) {
          await this.planRepository.save(
            this.planRepository.create({ ...plan, currency: 'LYD', points: 0, isPopular: plan.isPopular ?? false, isActive: true }),
          );
        } else {
          existing.featuresAr = plan.featuresAr;
          existing.featuresEn = plan.featuresEn;
          existing.nameAr = plan.nameAr;
          existing.nameEn = plan.nameEn;
          existing.price = plan.price;
          existing.currency = 'LYD';
          existing.sortOrder = plan.sortOrder;
          existing.isPopular = plan.isPopular ?? false;
          await this.planRepository.save(existing);
        }
      }
    } catch (e: any) {
      this.logger.warn(`Search plans seed warning: ${e.message}`);
    }
  }

  private async seedDefaultPlansIfNeeded() {
    try {
      const defaultPointsPlans = [
        {
          planId: 'basic',
          nameEn: '50 Points Package',
          nameAr: 'باقة 50 نقطة',
          price: 25,
          currency: 'LYD',
          points: 50,
          isPopular: false,
          isActive: true,
          featuresEn: ['50 instant reward points added', 'Enables unlocking 2 store contacts', 'Valid with no expiration date'],
          featuresAr: ['إضافة 50 نقطة فورية لرصيد المحفظة', 'تتيح فتح بيانات التواصل لمتجرين إضافيين', 'صالحة لجميع الخدمات وبدون تاريخ انتهاء'],
          sortOrder: 3,
        },
        {
          planId: 'pro',
          nameEn: '120 Points Package',
          nameAr: 'باقة 120 نقطة',
          price: 50,
          currency: 'LYD',
          points: 120,
          isPopular: true,
          isActive: true,
          featuresEn: ['120 points added (includes 20 bonus)', 'Enables unlocking 5 store contacts', 'Priority support and store alerts'],
          featuresAr: ['إضافة 120 نقطة (شاملة 20 نقطة مكافأة)', 'تتيح فتح بيانات التواصل لـ 5 متاجر', 'أولوية الدعم الفني وسرعة الردود'],
          sortOrder: 4,
        },
        {
          planId: 'elite',
          nameEn: '300 Points Package',
          nameAr: 'باقة 300 نقطة',
          price: 100,
          currency: 'LYD',
          points: 300,
          isPopular: false,
          isActive: true,
          featuresEn: ['300 points added (includes 50 bonus)', 'Enables unlocking 12 store contacts', 'Best value for workshops & companies'],
          featuresAr: ['إضافة 300 نقطة (شاملة 50 نقطة مكافأة)', 'تتيح فتح بيانات التواصل لـ 12 متجراً', 'أفضل توفير وقيمة للورش والمستخدم الدائم'],
          sortOrder: 5,
        },
      ];

      for (const planData of defaultPointsPlans) {
        const existing = await this.planRepository.findOne({ where: { planId: planData.planId } });
        if (!existing) {
          await this.planRepository.save(this.planRepository.create(planData));
        } else if (existing.currency === 'USD' || !existing.currency || existing.price < 1 || existing.price === 9.99 || existing.price === 19.99 || existing.price === 39.99) {
          existing.nameAr = planData.nameAr;
          existing.nameEn = planData.nameEn;
          existing.price = planData.price;
          existing.currency = 'LYD';
          existing.points = planData.points;
          existing.sortOrder = planData.sortOrder;
          existing.featuresAr = planData.featuresAr;
          existing.featuresEn = planData.featuresEn;
          await this.planRepository.save(existing);
        }
      }
    } catch (e: any) {
      this.logger.warn(`Default plans seed check warning: ${e.message}`);
    }
  }

  private get payNetApiUrl(): string {
    return (
      this.configService.get<string>('PAY_NET_API_URL') ||
      'https://dev-merchant.pay.net.ly'
    );
  }

  private get payNetStoreId(): string {
    return (
      this.configService.get<string>('PAY_NET_STORE_ID') ||
      'dev_store_spurgo_7829'
    );
  }

  private get payNetToken(): string {
    return this.configService.get<string>('PAY_NET_BEARER_TOKEN') || '';
  }

  private get appBackendUrl(): string {
    return (
      this.configService.get<string>('APP_BACKEND_URL') ||
      'https://spurgo-back.up.railway.app'
    );
  }

  // --- Dynamic Payment Plans Management (Admin & Client) ---

  async getActivePlans(): Promise<PaymentPlan[]> {
    const plans = await this.planRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    // Sanitize any legacy records to ensure Libyan Dinar (LYD) currency and clean prices
    for (const p of plans) {
      if (p.currency === 'USD' || !p.currency || p.price === 9.99 || p.price === 19.99 || p.price === 39.99) {
        p.currency = 'LYD';
        if (p.planId === 'basic') {
          p.nameAr = 'باقة 50 نقطة';
          p.nameEn = '50 Points Package';
          p.price = 25;
          p.points = 50;
          p.sortOrder = 3;
        } else if (p.planId === 'pro') {
          p.nameAr = 'باقة 120 نقطة';
          p.nameEn = '120 Points Package';
          p.price = 50;
          p.points = 120;
          p.sortOrder = 4;
        } else if (p.planId === 'elite') {
          p.nameAr = 'باقة 300 نقطة';
          p.nameEn = '300 Points Package';
          p.price = 100;
          p.points = 300;
          p.sortOrder = 5;
        }
        await this.planRepository.save(p).catch(() => {});
      }
    }
    return plans.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async getAllPlansForAdmin(): Promise<PaymentPlan[]> {
    return this.planRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createPlan(data: Partial<PaymentPlan>): Promise<PaymentPlan> {
    if (!data.planId || !data.nameEn || !data.nameAr || data.price === undefined || data.points === undefined) {
      throw new BadRequestException('planId, nameEn, nameAr, price, and points are required');
    }
    const existing = await this.planRepository.findOne({ where: { planId: data.planId } });
    if (existing) {
      throw new BadRequestException(`Plan with planId '${data.planId}' already exists`);
    }
    const plan = this.planRepository.create(data);
    return this.planRepository.save(plan);
  }

  async updatePlan(id: string, data: Partial<PaymentPlan>): Promise<PaymentPlan> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    Object.assign(plan, data);
    return this.planRepository.save(plan);
  }

  async deletePlan(id: string): Promise<{ success: boolean }> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    await this.planRepository.remove(plan);
    return { success: true };
  }

  // --- Initiate Payment with Dynamic Plan Lookup ---

  async initiatePayment(userId: string, planId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dbPlan = await this.planRepository.findOne({
      where: { planId: planId?.toLowerCase() },
    });

    // Price and points always come from the DB plan; client-sent amounts are ignored (they were tamperable).
    if (!dbPlan || !dbPlan.isActive) {
      throw new BadRequestException(`Plan '${planId}' not found`);
    }
    const { points, price: amountLYD, nameEn: planNameEn, nameAr: planNameAr } = dbPlan;

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const customRef = `PAY-${timestamp}-${randomHex}`;

    // Create pending payment transaction in database
    const transaction = this.transactionRepository.create({
      customRef,
      user,
      amount: amountLYD,
      pointsCredited: points,
      planId: dbPlan.planId,
      status: PaymentStatus.PENDING,
    });
    await this.transactionRepository.save(transaction);

    // Call Pay.net.ly Initiate Payment API
    const webhookUrl = `${this.appBackendUrl}/payments/webhook`;
    const redirectUrl = `${this.appBackendUrl}/payments/redirect?customRef=${customRef}`;

    const requestBody = {
      id: this.payNetStoreId,
      amount: amountLYD,
      phone: user.phoneNumber || '+218900000000',
      email: user.email || 'customer@spurgo.com',
      backend_url: webhookUrl,
      frontend_url: redirectUrl,
      custom_ref: customRef,
    };

    let checkoutUrl = `${this.payNetApiUrl}/checkout/${this.payNetStoreId}/${customRef}`;

    try {
      this.logger.log(
        `Initiating payment with Pay.net.ly for ref: ${customRef}, amount: ${amountLYD} LYD`,
      );

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.payNetToken) {
        headers['Authorization'] = `Bearer ${this.payNetToken}`;
      }

      const response = await fetch(`${this.payNetApiUrl}/payment/initiate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const resData: any = await response.json();
        if (resData?.url) {
          checkoutUrl = resData.url;
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `Pay.net.ly API call note for ${customRef}: ${e.message}. Using standard checkout URL: ${checkoutUrl}`,
      );
    }

    return {
      success: true,
      customRef,
      checkoutUrl,
      amount: amountLYD,
      points: points,
      planNameEn,
      planNameAr,
    };
  }

  async handleWebhook(body: any): Promise<any> {
    this.logger.log(`Received Pay.net.ly Webhook: ${JSON.stringify(body)}`);

    const customRef = body.custom_ref || body.customRef;
    if (!customRef) {
      return { status: 'ignored', reason: 'Missing custom_ref' };
    }

    const transaction = await this.transactionRepository.findOne({
      where: { customRef },
      relations: ['user'],
    });

    if (!transaction) {
      this.logger.warn(`Webhook transaction not found for ref: ${customRef}`);
      return { status: 'ignored', reason: 'Transaction not found' };
    }

    // Idempotency check: if already completed, do not double-credit points
    if (transaction.status === PaymentStatus.COMPLETED) {
      return { status: 'already_completed', customRef };
    }

    const isSuccess =
      body.result === 'success' ||
      body.status === 'success' ||
      body.result === 'COMPLETED';

    transaction.rawWebhookPayload = body;
    transaction.paymentMethod = body.payment_method || body.gateway || 'tadawul';
    transaction.gatewayRef = body.our_ref || body.reference || body.gateway_ref;

    if (isSuccess) {
      const completed = await this.verifyAndCompleteTransaction(transaction);
      if (!completed) return { status: 'unverified', customRef };
    } else {
      transaction.status = PaymentStatus.FAILED;
      await this.transactionRepository.save(transaction);
    }

    return { status: 'processed', customRef, transactionStatus: transaction.status };
  }

  // Returns false (transaction stays PENDING) when Pay.net does not confirm the payment.
  async verifyAndCompleteTransaction(transaction: PaymentTransaction): Promise<boolean> {
    if (this.payNetToken) {
      let verified = false;
      try {
        const verifyRes = await fetch(`${this.payNetApiUrl}/receipt/transaction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.payNetToken}`,
          },
          body: JSON.stringify({
            store_id: this.payNetStoreId,
            custom_ref: transaction.customRef,
          }),
        });
        const verifyData: any = verifyRes.ok ? await verifyRes.json() : null;
        verified = verifyData?.result === 'success';
      } catch (e: any) {
        this.logger.warn(`Verification API error for ${transaction.customRef}: ${e.message}`);
      }
      if (!verified) {
        // Paid data is unlocked by this credit, so an unverified webhook must not complete it.
        this.logger.warn(`Payment ${transaction.customRef} not confirmed by Pay.net, left PENDING`);
        await this.transactionRepository.save(transaction);
        return false;
      }
    }

    transaction.status = PaymentStatus.COMPLETED;
    await this.transactionRepository.save(transaction);

    const user = transaction.user;
    if (user) {
      const ref = transaction.customRef;
      if (transaction.pointsCredited > 0) {
        await this.usersService.addLedger(user.id, transaction.pointsCredited, 'purchase', { ref });
      }
      await this.usersService.award(user.id, 'paid', { ref }); // "10 points after a paid subscription"

      await this.notificationsService.sendSystemNotification(
        user.id,
        'Payment Successful!',
        `Your payment of ${transaction.amount} LYD was successful.`,
        'PAYMENT_SUCCESS',
        { customRef: ref, points: String(transaction.pointsCredited), planId: transaction.planId },
      );

      this.logger.log(`Completed payment ${ref} for user ${user.email}`);
    }
    return true;
  }

  async getTransactionsForAdmin(status: string | undefined, page: number, limit: number) {
    const where = status ? { status: status as PaymentStatus } : {};
    const [rows, total] = await this.transactionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 100),
    });
    const all = await this.transactionRepository.find({ select: ['status', 'amount'] as any, loadEagerRelations: false });
    const summary = { revenue: 0, completed: 0, pending: 0, failed: 0 };
    for (const t of all) {
      if (t.status === PaymentStatus.COMPLETED) {
        summary.completed++;
        summary.revenue += Number(t.amount) || 0;
      } else if (t.status === PaymentStatus.PENDING) summary.pending++;
      else summary.failed++;
    }
    summary.revenue = Math.round(summary.revenue * 100) / 100;
    return {
      total,
      page,
      summary,
      data: rows.map((t) => ({
        id: t.id,
        customRef: t.customRef,
        amount: t.amount,
        planId: t.planId,
        pointsCredited: t.pointsCredited,
        status: t.status,
        paymentMethod: t.paymentMethod,
        usedAt: t.usedAt,
        createdAt: t.createdAt,
        user: t.user ? { id: t.user.id, fullName: t.user.fullName, email: t.user.email, phoneNumber: t.user.phoneNumber } : null,
      })),
    };
  }

  async getTransactionStatus(customRef: string, userId: string): Promise<any> {
    const transaction = await this.transactionRepository.findOne({
      where: { customRef },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.user.id !== userId) {
      throw new BadRequestException('Unauthorized transaction access');
    }

    return {
      customRef: transaction.customRef,
      status: transaction.status,
      amount: transaction.amount,
      pointsCredited: transaction.pointsCredited,
      planId: transaction.planId,
      paymentMethod: transaction.paymentMethod,
      updatedAt: transaction.updatedAt,
    };
  }
}
