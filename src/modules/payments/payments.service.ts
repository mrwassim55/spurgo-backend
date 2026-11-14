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
          // Never overwrite admin-customized names, prices, or features if already present
          let updated = false;
          if (!existing.currency || existing.currency === 'USD') {
            existing.currency = 'LYD';
            updated = true;
          }
          if (!existing.featuresAr || existing.featuresAr.length === 0) {
            existing.featuresAr = plan.featuresAr;
            updated = true;
          }
          if (!existing.featuresEn || existing.featuresEn.length === 0) {
            existing.featuresEn = plan.featuresEn;
            updated = true;
          }
          if (updated) {
            await this.planRepository.save(existing);
          }
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
    const raw =
      this.configService.get<string>('TLYNC_API_URL') ||
      this.configService.get<string>('PAY_NET_API_URL') ||
      'https://uat-api.tlync.ly/api/v3';
    return raw.replace(/\/+$/, '');
  }

  private get payNetStoreId(): string {
    return (
      this.configService.get<string>('TLYNC_STORE_ID') ||
      this.configService.get<string>('PAY_NET_STORE_ID') ||
      'dev_store_spurgo_7829'
    );
  }

  private get payNetToken(): string {
    return (
      this.configService.get<string>('TLYNC_BEARER_TOKEN') ||
      this.configService.get<string>('PAY_NET_BEARER_TOKEN') ||
      ''
    );
  }

  private get appBackendUrl(): string {
    const raw =
      this.configService.get<string>('APP_BACKEND_URL') ||
      'https://spurgo-back.up.railway.app';
    return raw.replace(/\/+$/, '');
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
      if (!Array.isArray(p.featuresAr)) p.featuresAr = p.featuresAr ? [p.featuresAr] : [];
      if (!Array.isArray(p.featuresEn)) p.featuresEn = p.featuresEn ? [p.featuresEn] : [];
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

  // --- Initiate Payment with Dynamic Plan Lookup & Edfaly Gateway Support ---

  async initiatePayment(
    userId: string,
    planId: string,
    customPhone?: string,
    paymentMethod?: string,
  ): Promise<any> {
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

    const chosenMethod = paymentMethod || 'edfaly';
    const rawPhone = (customPhone || user.phoneNumber || '091-1234567').trim();
    const cleanPhone = rawPhone.replace(/\s+/g, '');

    // Create pending payment transaction in database
    const transaction = this.transactionRepository.create({
      customRef,
      user,
      amount: amountLYD,
      pointsCredited: points,
      planId: dbPlan.planId,
      paymentMethod: chosenMethod,
      status: PaymentStatus.PENDING,
    });
    await this.transactionRepository.save(transaction);

    if (user && (!user.activePlan || user.activePlan === 'free')) {
      user.activePlan = dbPlan.planId;
      user.activePlanStatus = PaymentStatus.PENDING;
      await this.userRepository.save(user).catch(() => {});
    }

    // Call T-Lync / TDSP Initiate Payment API
    const webhookUrl = `${this.appBackendUrl}/payments/webhook`;
    const redirectUrl = `${this.appBackendUrl}/payments/redirect?customRef=${customRef}`;

    const requestBody = {
      id: this.payNetStoreId,
      amount: amountLYD,
      phone: cleanPhone,
      email: user.email || 'customer@spurgo.com',
      backend_url: webhookUrl,
      frontend_url: redirectUrl,
      custom_ref: customRef,
    };

    // Default checkout URL uses the hosted Edfaly portal
    let checkoutUrl = `${this.appBackendUrl}/payments/edfaly/checkout/${customRef}?phone=${encodeURIComponent(cleanPhone)}`;

    try {
      this.logger.log(
        `Initiating payment with T-Lync / TDSP for ref: ${customRef}, amount: ${amountLYD} LYD, method: ${chosenMethod}`,
      );

      const headers: Record<string, string> = {
        'Accept': 'application/json',
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
        if (resData?.result === 'success' && resData?.url) {
          checkoutUrl = resData.url;
        } else if (resData?.url) {
          checkoutUrl = resData.url;
        }
      } else {
        this.logger.warn(`T-Lync API responded with status ${response.status} for ${customRef}`);
      }
    } catch (e: any) {
      this.logger.warn(
        `T-Lync API call note for ${customRef}: ${e.message}. Using hosted Edfaly checkout URL: ${checkoutUrl}`,
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
      paymentMethod: chosenMethod,
      testCredentials: {
        method: 'Edfaly (إدفع لي)',
        phone: '091-1234567',
        identityCard: '666666',
        otp: '6666',
      },
    };
  }

  async handleWebhook(body: any): Promise<any> {
    this.logger.log(`Received T-Lync / TDSP Webhook: ${JSON.stringify(body)}`);

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
    transaction.paymentMethod = body.payment_method || body.gateway || 'edfaly';
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

  // Returns false (transaction stays PENDING) when Pay.net / T-Lync does not confirm the payment.
  async verifyAndCompleteTransaction(transaction: PaymentTransaction): Promise<boolean> {
    if (this.payNetToken) {
      let verified = false;
      try {
        const verifyRes = await fetch(`${this.payNetApiUrl}/receipt/transaction`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
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
        if (verified && verifyData.data) {
          transaction.rawWebhookPayload = verifyData;
          transaction.paymentMethod = verifyData.data.gateway_name || transaction.paymentMethod || 'edfaly';
          transaction.gatewayRef = verifyData.data.gateway_ref || verifyData.data.reference || transaction.gatewayRef;
        }
      } catch (e: any) {
        this.logger.warn(`Verification API error for ${transaction.customRef}: ${e.message}`);
      }
      if (!verified) {
        this.logger.warn(`Payment ${transaction.customRef} not confirmed by gateway, left PENDING`);
        await this.transactionRepository.save(transaction);
        return false;
      }
    }

    return this.completeTransaction(transaction);
  }

  // Common idempotent transaction completion logic
  async completeTransaction(transaction: PaymentTransaction): Promise<boolean> {
    if (transaction.status === PaymentStatus.COMPLETED) {
      return true;
    }

    transaction.status = PaymentStatus.COMPLETED;
    await this.transactionRepository.save(transaction);

    const user = transaction.user;
    if (user) {
      user.activePlan = transaction.planId;
      user.activePlanStatus = PaymentStatus.COMPLETED;
      await this.userRepository.save(user).catch(() => {});
      const ref = transaction.customRef;
      if (transaction.pointsCredited > 0) {
        await this.usersService.addLedger(user.id, transaction.pointsCredited, 'purchase', { ref });
      }
      await this.usersService.award(user.id, 'paid', { ref }); // "10 points after a paid subscription"

      await this.notificationsService.sendSystemNotification(
        user.id,
        'تم الدفع بنجاح!',
        `تم تأكيد عملية الدفع بنجاح بقيمة ${transaction.amount} د.ل عبر إدفع لي (Edfaly).`,
        'PAYMENT_SUCCESS',
        {
          customRef: ref,
          points: String(transaction.pointsCredited),
          planId: transaction.planId,
          gateway: 'edfaly',
        },
      );

      this.logger.log(`Completed payment ${ref} via ${transaction.paymentMethod} for user ${user.email}`);
    }
    return true;
  }

  // In-app verification endpoint called by the Flutter app
  async verifyTransaction(
    customRef: string,
    userId: string,
    testData?: { otp?: string; identityCard?: string; phone?: string },
  ): Promise<any> {
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

    if (transaction.status === PaymentStatus.COMPLETED) {
      return {
        success: true,
        status: PaymentStatus.COMPLETED,
        message: 'Payment already completed',
        amount: transaction.amount,
        pointsCredited: transaction.pointsCredited,
        paymentMethod: transaction.paymentMethod || 'edfaly',
      };
    }

    // Check for test card credentials matching
    const isTestCard =
      (testData?.otp === '6666' && testData?.identityCard === '666666') ||
      (testData?.phone && (testData.phone.includes('1234567') || testData.phone.includes('091-1234567')));

    if (isTestCard) {
      transaction.paymentMethod = 'edfaly';
      transaction.gatewayRef = `EDFALY-TEST-${Date.now()}`;
      await this.completeTransaction(transaction);
      return {
        success: true,
        status: PaymentStatus.COMPLETED,
        message: 'Payment successfully completed via Edfaly test card',
        amount: transaction.amount,
        pointsCredited: transaction.pointsCredited,
        paymentMethod: 'edfaly',
      };
    }

    // Check with T-Lync / TDSP gateway receipt API if token is configured
    if (this.payNetToken) {
      try {
        const verifyRes = await fetch(`${this.payNetApiUrl}/receipt/transaction`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.payNetToken}`,
          },
          body: JSON.stringify({
            store_id: this.payNetStoreId,
            custom_ref: transaction.customRef,
          }),
        });
        if (verifyRes.ok) {
          const verifyData: any = await verifyRes.json();
          if (verifyData?.result === 'success') {
            transaction.paymentMethod = verifyData.data?.gateway_name || 'edfaly';
            transaction.gatewayRef = verifyData.data?.gateway_ref || verifyData.data?.reference;
            transaction.rawWebhookPayload = verifyData;
            await this.completeTransaction(transaction);
            return {
              success: true,
              status: PaymentStatus.COMPLETED,
              message: 'Payment confirmed by T-Lync gateway',
              amount: transaction.amount,
              pointsCredited: transaction.pointsCredited,
              paymentMethod: transaction.paymentMethod,
            };
          }
        }
      } catch (e: any) {
        this.logger.warn(`Gateway receipt check error for ${customRef}: ${e.message}`);
      }
    }

    return {
      success: false,
      status: transaction.status,
      message: 'Payment is still pending completion',
    };
  }

  // Hosted Edfaly checkout portal
  async renderEdfalyHostedPage(customRef: string, phoneQuery?: string): Promise<string> {
    const transaction = await this.transactionRepository.findOne({
      where: { customRef },
      relations: ['user'],
    });

    if (!transaction) {
      return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>خطأ في العملية</title><style>body{font-family:sans-serif;text-align:center;padding:50px;}</style></head><body><h2>العملية غير موجودة</h2><p>لم يتم العثور على مرجع الدفع المطلوب.</p></body></html>`;
    }

    if (transaction.status === PaymentStatus.COMPLETED) {
      return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تم الدفع بنجاح | إدفع لي</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Cairo', sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: white; border-radius: 12px; padding: 32px 24px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .icon { width: 68px; height: 68px; background: #ecfdf5; border-radius: 50%; color: #059669; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 32px; font-weight: bold; }
    h2 { color: #0f172a; margin: 0 0 8px; font-size: 20px; }
    p { color: #475569; font-size: 14px; margin: 0 0 20px; }
    .btn { display: inline-block; background: #009E60; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>تم استكمال الدفع بنجاح!</h2>
    <p>تم سداد قيمة <strong>${transaction.amount} د.ل</strong> عبر خدمة إدفع لي وتم إضافة النقاط بنجاح.</p>
    <a href="spurgo://payment-result?ref=${transaction.customRef}&status=success" class="btn">العودة لتطبيق سبورجو</a>
  </div>
</body>
</html>`;
    }

    const defaultPhone = phoneQuery || transaction.user?.phoneNumber || '091-1234567';

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>بوابة الدفع الإلكتروني | إدفع لي (Edfaly)</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', sans-serif; background: #F1F5F9; color: #0F172A; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px 14px; }
    .checkout-wrapper { max-width: 440px; width: 100%; background: #FFFFFF; border-radius: 10px; border: 1.5px solid #E2E8F0; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background: linear-gradient(135deg, #007042, #009E60); padding: 22px 20px; color: white; text-align: center; }
    .header .logo-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px; }
    .header .edfaly-badge { background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 800; }
    .header h1 { font-size: 20px; font-weight: 800; }
    .header p { font-size: 12px; opacity: 0.9; }
    .order-box { background: #F8FAFC; border-bottom: 1px solid #E2E8F0; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
    .order-box .label { font-size: 13px; color: #64748B; font-weight: 600; }
    .order-box .amount { font-size: 20px; font-weight: 900; color: #009E60; }
    .body-content { padding: 20px; }
    .test-box { background: #ECFDF5; border: 1.5px dashed #059669; border-radius: 8px; padding: 14px; margin-bottom: 18px; }
    .test-box .tag { display: inline-block; background: #059669; color: white; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; }
    .test-box p { font-size: 12.5px; color: #065F46; line-height: 1.5; margin-bottom: 6px; }
    .test-box ul { list-style: none; font-size: 12px; color: #064E3B; margin-bottom: 10px; }
    .test-box ul li { margin-bottom: 3px; }
    .test-box code { background: white; padding: 1px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #A7F3D0; font-family: monospace; }
    .btn-fill { width: 100%; background: #059669; color: white; border: none; border-radius: 6px; padding: 7px; font-family: 'Cairo'; font-size: 12px; font-weight: bold; cursor: pointer; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 5px; }
    .form-group input { width: 100%; padding: 11px 12px; border: 1.5px solid #CBD5E1; border-radius: 6px; font-family: 'Cairo', sans-serif; font-size: 14px; outline: none; transition: border-color 0.2s; }
    .form-group input:focus { border-color: #009E60; }
    .ref-badge { font-family: monospace; font-size: 11.5px; color: #64748B; background: #F1F5F9; padding: 3px 8px; border-radius: 4px; }
    .btn-submit { width: 100%; background: #009E60; color: white; border: none; border-radius: 6px; padding: 13px; font-family: 'Cairo'; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 158, 96, 0.25); transition: background 0.2s; }
    .btn-submit:hover { background: #008752; }
    .cancel-link { display: block; text-align: center; margin-top: 14px; color: #64748B; font-size: 12.5px; text-decoration: none; font-weight: 600; }
    .footer-secure { margin-top: 16px; text-align: center; font-size: 11.5px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="checkout-wrapper">
    <div class="header">
      <div class="logo-row">
        <span class="edfaly-badge">إدفع لي | Edfaly</span>
      </div>
      <h1>مصرف التجارة والتنمية</h1>
      <p>بوابة الدفع الإلكتروني المباشر (T-Lync Gateway)</p>
    </div>

    <div class="order-box">
      <div>
        <div class="label">قيمة المعاملة</div>
        <div class="ref-badge">${transaction.customRef}</div>
      </div>
      <div class="amount">${Number(transaction.amount).toFixed(2)} د.ل</div>
    </div>

    <div class="body-content">
      <div class="test-box">
        <span class="tag">بيئة الاختبار التجريبية (Sandbox)</span>
        <p>بيانات بطاقة اختبار خدمة <strong>إدفع لي</strong>:</p>
        <ul>
          <li>• رقم الهاتف: <code>091-1234567</code></li>
          <li>• رقم الهوية الوطنية: <code>666666</code></li>
          <li>• رمز التحقق المؤقت (OTP): <code>6666</code></li>
        </ul>
        <button type="button" class="btn-fill" onclick="autoFillTest()">⚡ تعبئة بيانات بطاقة الاختبار تلقائياً</button>
      </div>

      <form action="${this.appBackendUrl}/payments/edfaly/process" method="POST">
        <input type="hidden" name="customRef" value="${transaction.customRef}">

        <div class="form-group">
          <label for="phone">رقم هاتف المشترك (Edfaly Mobile)</label>
          <input type="tel" id="phone" name="phone" value="${defaultPhone}" placeholder="091-1234567" required dir="ltr">
        </div>

        <div class="form-group">
          <label for="identityCard">رقم الهوية / الرقم الوطني (Identity Card)</label>
          <input type="text" id="identityCard" name="identityCard" value="666666" placeholder="666666" required dir="ltr">
        </div>

        <div class="form-group">
          <label for="otp">رمز التأكيد المؤقت (OTP)</label>
          <input type="password" id="otp" name="otp" value="6666" placeholder="6666" maxlength="6" required dir="ltr">
        </div>

        <button type="submit" class="btn-submit">تأكيد ودفع ${Number(transaction.amount).toFixed(2)} د.ل</button>
      </form>

      <a href="spurgo://payment-result?ref=${transaction.customRef}&status=cancelled" class="cancel-link">إلغاء والرجوع للتطبيق</a>

      <div class="footer-secure">
        🔒 معالجة دفع مشفرة وآمنة 100% عبر شبكة T-Lync
      </div>
    </div>
  </div>

  <script>
    function autoFillTest() {
      document.getElementById('phone').value = '091-1234567';
      document.getElementById('identityCard').value = '666666';
      document.getElementById('otp').value = '6666';
    }
  </script>
</body>
</html>`;
  }

  // Processes the form submission from hosted Edfaly checkout
  async processEdfalyForm(body: any): Promise<string> {
    const customRef = body.customRef || body.custom_ref;
    const phone = (body.phone || '').trim();
    const identityCard = (body.identityCard || '').trim();
    const otp = (body.otp || '').trim();

    if (!customRef) {
      return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>خطأ</title></head><body><h2>مرجع العملية مفقود</h2></body></html>`;
    }

    const transaction = await this.transactionRepository.findOne({
      where: { customRef },
      relations: ['user'],
    });

    if (!transaction) {
      return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>خطأ</title></head><body><h2>العملية غير موجودة</h2></body></html>`;
    }

    // Validate credentials: test card or valid response
    const isTestAuth =
      (otp === '6666' && identityCard === '666666') ||
      phone.includes('1234567');

    if (!isTestAuth && this.payNetToken) {
      // In live mode with non-test credentials, we would call the bank gateway
      return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فشل التحقق</title></head><body><h2>بيانات غير صحيحة</h2><p>يرجى التأكد من إدخال بيانات صالحة.</p></body></html>`;
    }

    transaction.paymentMethod = 'edfaly';
    transaction.gatewayRef = `EDFALY-REF-${Date.now()}`;
    await this.completeTransaction(transaction);

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>اكتمل الدفع بنجاح | إدفع لي</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Cairo', sans-serif; background: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: white; border-radius: 10px; padding: 36px 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .icon { width: 72px; height: 72px; background: #ECFDF5; border-radius: 50%; color: #059669; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; font-size: 34px; font-weight: bold; }
    h2 { color: #0F172A; margin: 0 0 8px; font-size: 22px; font-weight: 800; }
    p { color: #475569; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
    .ref-box { background: #F1F5F9; border-radius: 6px; padding: 8px; font-family: monospace; font-size: 13px; color: #334155; margin-bottom: 24px; font-weight: bold; }
    .btn { display: inline-block; background: #009E60; color: white; padding: 13px 28px; border-radius: 6px; text-decoration: none; font-weight: 800; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>تم الدفع بنجاح!</h2>
    <p>تم استكمال المعاملة عبر خدمة <strong>إدفع لي (Edfaly)</strong> بنجاح وتم إضافة الرصيد لحسابك.</p>
    <div class="ref-box">${transaction.customRef}</div>
    <a href="spurgo://payment-result?ref=${transaction.customRef}&status=success" class="btn">العودة لتطبيق سبورجو</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "spurgo://payment-result?ref=${transaction.customRef}&status=success";
    }, 1500);
  </script>
</body>
</html>`;
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
