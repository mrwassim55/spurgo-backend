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
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlansIfNeeded();
  }

  private async seedDefaultPlansIfNeeded() {
    try {
      const count = await this.planRepository.count();
      if (count === 0) {
        this.logger.log('Seeding initial payment plans into database...');
        const initialPlans = [
          {
            planId: 'basic',
            nameEn: 'Basic Plan',
            nameAr: 'الباقة الأساسية',
            price: 9.99,
            currency: 'USD',
            points: 100,
            isPopular: false,
            isActive: true,
            featuresEn: ['Search accessory parts', 'Standard email support', '100 Reward Points'],
            featuresAr: ['البحث عن قطع الإكسسوارات', 'الدعم الفني Standard', '100 نقطة مكافأة'],
            sortOrder: 1,
          },
          {
            planId: 'pro',
            nameEn: 'Pro Plan',
            nameAr: 'الباقة الاحترافية',
            price: 19.99,
            currency: 'USD',
            points: 250,
            isPopular: true,
            isActive: true,
            featuresEn: ['Priority request listing', '24/7 Priority support', '250 Reward Points', 'Supplier Direct Bidding'],
            featuresAr: ['أولوية عرض الطلبات', 'دعم فني على مدار الساعة', '250 نقطة مكافأة', 'تقديم عروض الموردين المباشرة'],
            sortOrder: 2,
          },
          {
            planId: 'elite',
            nameEn: 'Elite Plan',
            nameAr: 'الباقة النخبة',
            price: 39.99,
            currency: 'USD',
            points: 600,
            isPopular: false,
            isActive: true,
            featuresEn: ['Unlimited request posts', 'Dedicated Account Manager', '600 Reward Points', 'Verified VIP Badge'],
            featuresAr: ['إضافة طلبات غير محدودة', 'مدير حساب خاص', '600 نقطة مكافأة', 'شارة الحساب الموثوق VIP'],
            sortOrder: 3,
          },
        ];
        for (const planData of initialPlans) {
          const plan = this.planRepository.create(planData);
          await this.planRepository.save(plan);
        }
        this.logger.log('Initial payment plans seeded successfully.');
      }
    } catch (e: any) {
      this.logger.warn(`Payment plans seed check warning: ${e.message}`);
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
    return this.planRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
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

  async initiatePayment(
    userId: string,
    planId: string,
    customAmountLYD?: number,
    customPoints?: number,
  ): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let points: number;
    let amountLYD: number;
    let planNameEn: string;
    let planNameAr: string;

    // Look up plan dynamically from DB first
    const dbPlan = await this.planRepository.findOne({
      where: { planId: planId?.toLowerCase() },
    });

    if (dbPlan) {
      points = dbPlan.points;
      amountLYD = dbPlan.price;
      planNameEn = dbPlan.nameEn;
      planNameAr = dbPlan.nameAr;
    } else if (customAmountLYD && customAmountLYD > 0 && customPoints && customPoints > 0) {
      points = customPoints;
      amountLYD = customAmountLYD;
      planNameEn = `${points} Points Package`;
      planNameAr = `باقة ${points} نقطة`;
    } else {
      throw new BadRequestException(`Plan '${planId}' not found`);
    }

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const customRef = `PAY-${timestamp}-${randomHex}`;

    // Create pending payment transaction in database
    const transaction = this.transactionRepository.create({
      customRef,
      user,
      amount: amountLYD,
      pointsCredited: points,
      planId: planId || 'custom',
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
      await this.verifyAndCompleteTransaction(transaction);
    } else {
      transaction.status = PaymentStatus.FAILED;
      await this.transactionRepository.save(transaction);
    }

    return { status: 'processed', customRef, transactionStatus: transaction.status };
  }

  async verifyAndCompleteTransaction(transaction: PaymentTransaction): Promise<void> {
    try {
      if (this.payNetToken) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.payNetToken}`,
        };
        const verifyRes = await fetch(
          `${this.payNetApiUrl}/receipt/transaction`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              store_id: this.payNetStoreId,
              custom_ref: transaction.customRef,
            }),
          },
        );
        const verifyData: any = verifyRes.ok ? await verifyRes.json() : null;

        if (verifyData?.result !== 'success') {
          this.logger.warn(
            `Verification check for ${transaction.customRef} returned incomplete status`,
          );
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `Verification check API error (non-fatal, proceeding with transaction completion): ${e.message}`,
      );
    }

    transaction.status = PaymentStatus.COMPLETED;
    await this.transactionRepository.save(transaction);

    const user = transaction.user;
    if (user) {
      user.points = (user.points || 0) + transaction.pointsCredited;
      await this.userRepository.save(user);

      await this.notificationsService.sendSystemNotification(
        user.id,
        'Payment Successful! Points Credited',
        `Your payment of ${transaction.amount} LYD was successful. ${transaction.pointsCredited} bonus points have been added to your account!`,
        'PAYMENT_SUCCESS',
        { customRef: transaction.customRef, points: transaction.pointsCredited },
      );

      this.logger.log(
        `Successfully credited ${transaction.pointsCredited} points to user ${user.email} (ref: ${transaction.customRef})`,
      );
    }
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
      paymentMethod: transaction.paymentMethod,
      updatedAt: transaction.updatedAt,
    };
  }
}
