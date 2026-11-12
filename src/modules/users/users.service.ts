import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, EntityManager, Not, IsNull, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { SystemConfig } from './entities/system-config.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { PointsEntry } from './entities/points-entry.entity';
import { AWARDS, AwardReason, DEFAULT_SETTINGS, SettingKey, Settings } from './rules';
import {
  AccessoryRequest,
  RequestStatus,
} from '../requests/entities/accessory-request.entity';
import { Offer, OfferStatus } from '../offers/entities/offer.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { RequestTarget } from '../requests/entities/request-target.entity';
import { ContactUnlock } from '../offers/entities/contact-unlock.entity';
import { PaymentTransaction, PaymentStatus } from '../payments/entities/payment-transaction.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
    @InjectRepository(AdminNotification)
    private readonly adminNotificationsRepository: Repository<AdminNotification>,
    @InjectRepository(PointsEntry)
    private readonly pointsRepository: Repository<PointsEntry>,
    private readonly entityManager: EntityManager,
  ) {}

  async onModuleInit() {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await this.ensureConfig(key, String(value));
    }

    try {
      await this.usersRepository.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS "activePlan" varchar; ALTER TABLE users ADD COLUMN IF NOT EXISTS "activePlanStatus" varchar;`
      );
    } catch {
      try {
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN activePlan varchar;`);
      } catch {}
      try {
        await this.usersRepository.query(`ALTER TABLE users ADD COLUMN activePlanStatus varchar;`);
      } catch {}
    }

    const migrationKey = 'otp_migration_done';
    const migrationConfig = await this.configRepository.findOne({
      where: { key: migrationKey },
    });
    if (!migrationConfig) {
      await this.usersRepository
        .createQueryBuilder()
        .update(User)
        .set({ isEmailVerified: true })
        .execute();
      await this.configRepository.save({ key: migrationKey, value: 'true' });
    }

    await this.seedDefaultUsers();
  }

  private async seedDefaultUsers(): Promise<void> {
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const seedList: Partial<User>[] = [
      {
        email: 'admin@spurgo.io',
        fullName: 'Admin Spurgo',
        role: UserRole.ADMIN,
        phoneNumber: '+218910000001',
        whatsapp: '+218910000001',
        points: 9999,
        isApproved: true,
        isEmailVerified: true,
      },
      {
        email: 'moderator@spurgo.io',
        fullName: 'Moderator Spurgo',
        role: UserRole.MODERATOR,
        phoneNumber: '+218910000002',
        whatsapp: '+218910000002',
        points: 5000,
        isApproved: true,
        isEmailVerified: true,
      },
      {
        email: 'staff@spurgo.io',
        fullName: 'Staff Spurgo',
        role: UserRole.STAFF,
        phoneNumber: '+218910000003',
        whatsapp: '+218910000003',
        points: 5000,
        isApproved: true,
        isEmailVerified: true,
      },
      {
        email: 'supplier@spurgo.io',
        fullName: 'Pro Auto Supplier',
        role: UserRole.SUPPLIER,
        companyName: 'Spurgo Auto Parts Co.',
        specializations: 'German, Japanese, Korean, American',
        taxId: 'TAX-SPURGO-SUPPLIER-01',
        phoneNumber: '+218910000004',
        whatsapp: '+218910000004',
        points: 2000,
        isApproved: true,
        isEmailVerified: true,
        verificationStatus: 'approved',
      },
      {
        email: 'customer@spurgo.io',
        fullName: 'Spurgo Customer',
        role: UserRole.CUSTOMER,
        phoneNumber: '+218910000005',
        whatsapp: '+218910000005',
        points: 1000,
        isApproved: true,
        isEmailVerified: true,
      },
      {
        email: 'wassim.benchaoua@gmail.com',
        fullName: 'Wassim Benchaoua',
        role: UserRole.CUSTOMER,
        phoneNumber: '+21699000001',
        whatsapp: '+21699000001',
        points: 1000,
        isApproved: true,
        isEmailVerified: true,
      },
      {
        email: 'bahaa.kafo@gmail.com',
        fullName: 'Bahaa Kafo',
        role: UserRole.CUSTOMER,
        phoneNumber: '+218910000006',
        whatsapp: '+218910000006',
        points: 1000,
        isApproved: true,
        isEmailVerified: true,
      },
    ];

    for (const item of seedList) {
      try {
        const existing = await this.usersRepository.findOne({
          where: { email: item.email },
        });
        if (!existing) {
          const user = this.usersRepository.create({
            ...item,
            password: hashedPassword,
            isActive: true,
          });
          await this.usersRepository.save(user);
        } else {
          existing.password = hashedPassword;
          existing.isApproved = true;
          existing.isEmailVerified = true;
          existing.isActive = true;
          await this.usersRepository.save(existing);
        }
      } catch (err) {
        console.error(`Failed to seed user ${item.email}:`, err);
      }
    }
  }

  private async ensureConfig(key: string, defaultValue: string): Promise<void> {
    try {
      const exists = await this.configRepository.findOne({ where: { key } });
      if (!exists) {
        const config = this.configRepository.create({
          key,
          value: defaultValue,
        });
        await this.configRepository.save(config);
      }
    } catch (e) {
      console.error(`Failed to ensure config seed for key ${key}:`, e);
    }
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateFcmToken(userId: string, fcmToken: string): Promise<User> {
    const user = await this.findById(userId);
    user.fcmToken = fcmToken;
    return this.usersRepository.save(user);
  }

  async updateProfile(id: string, updateData: any): Promise<User> {
    const user = await this.findById(id);

    const allowedFields = [
      'fullName',
      'phoneNumber',
      'whatsapp',
      'region',
      'city',
      'address',
      'companyName',
      'taxId',
      'specializations',
      'avatar',
      'verificationDocuments',
    ];

    for (const key of allowedFields) {
      if (updateData[key] !== undefined) {
        user[key] = updateData[key];
      }
    }

    if (
      updateData.verificationDocuments &&
      Array.isArray(updateData.verificationDocuments) &&
      updateData.verificationDocuments.length > 0
    ) {
      if (user.role === UserRole.SUPPLIER) {
        user.verificationStatus = 'pending';
        user.isApproved = false;
      }
    }

    return this.usersRepository.save(user);
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.configRepository.find();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (row.key in settings && Number.isFinite(Number(row.value))) {
        settings[row.key as SettingKey] = Number(row.value);
      }
    }
    return settings;
  }

  async updateSettings(partial: Record<string, any>): Promise<Settings> {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (partial?.[key] === undefined || partial[key] === null || partial[key] === '') continue;
      const value = Number(partial[key]);
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`${key} must be a non-negative number`);
      }
      await this.configRepository.save({ key, value: String(value) });
    }
    return this.getSettings();
  }

  async getCustomTexts(lang = 'ar'): Promise<Record<string, Record<string, string>>> {
    const row = await this.configRepository.findOne({ where: { key: `admin.custom_texts.${lang}` } });
    if (!row || !row.value) return {};
    try {
      return JSON.parse(row.value);
    } catch {
      return {};
    }
  }

  async updateCustomTexts(texts: Record<string, any>, lang = 'ar'): Promise<{ success: boolean; count: number; updatedAt: string }> {
    const now = new Date().toISOString();
    await this.configRepository.save({
      key: `admin.custom_texts.${lang}`,
      value: JSON.stringify(texts || {}),
    });
    await this.configRepository.save({
      key: `admin.custom_texts.${lang}.updatedAt`,
      value: now,
    });
    return {
      success: true,
      count: Object.keys(texts || {}).length,
      updatedAt: now,
    };
  }

  async resetCustomTexts(lang = 'ar'): Promise<{ success: boolean; message: string }> {
    await this.configRepository.delete({ key: `admin.custom_texts.${lang}` });
    await this.configRepository.delete({ key: `admin.custom_texts.${lang}.updatedAt` });
    return {
      success: true,
      message: 'تمت استعادة كافة النصوص الافتراضية بنجاح.',
    };
  }

  // Writes a ledger row and moves the balance. Idempotent per (user, reason, ref) when ref is given.
  async addLedger(
    userId: string,
    amount: number,
    reason: string,
    opts: { requestId?: string; ref?: string } = {},
  ): Promise<PointsEntry | null> {
    if (!amount) return null;
    if (opts.ref) {
      const exists = await this.pointsRepository.findOne({
        where: { user: { id: userId }, reason, ref: opts.ref },
      });
      if (exists) return null;
    }
    const entry = await this.pointsRepository.save(
      this.pointsRepository.create({
        user: { id: userId } as User,
        amount,
        reason,
        requestId: opts.requestId,
        ref: opts.ref,
      }),
    );
    await this.usersRepository.increment({ id: userId }, 'points', amount);
    return entry;
  }

  // Awards the points configured for this reason (client doc §8). Same reason+ref is only paid once.
  async award(
    userId: string,
    reason: AwardReason,
    opts: { requestId?: string; ref?: string } = {},
  ): Promise<PointsEntry | null> {
    const settings = await this.getSettings();
    const amount = settings[AWARDS[reason]];
    return this.addLedger(userId, amount, reason, {
      requestId: opts.requestId,
      ref: opts.ref ?? opts.requestId ?? reason,
    });
  }

  // Atomic spend: fails instead of going negative.
  async spendPoints(
    userId: string,
    amount: number,
    reason: string,
    opts: { requestId?: string; ref?: string } = {},
  ): Promise<void> {
    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ points: () => `points - ${Math.floor(amount)}` })
      .where('id = :id AND points >= :amount', { id: userId, amount })
      .execute();
    if (!result.affected) {
      throw new BadRequestException('Insufficient points');
    }
    await this.pointsRepository.save(
      this.pointsRepository.create({
        user: { id: userId } as User,
        amount: -amount,
        reason,
        requestId: opts.requestId,
        ref: opts.ref,
      }),
    );
  }

  async getPointsHistory(userId: string): Promise<PointsEntry[]> {
    return this.pointsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async addPoints(id: string, amount: number): Promise<User> {
    await this.addLedger(id, amount, 'admin');
    return this.findById(id);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async updatePoints(id: string, points: number): Promise<User> {
    const user = await this.findById(id);
    const pointsNum =
      typeof points === 'number' ? points : parseInt(String(points), 10);
    await this.addLedger(id, pointsNum - user.points, 'admin');
    return this.findById(id);
  }

  async getSystemStats(rangeDays = 14): Promise<any> {
    const totalUsers = await this.usersRepository.count();
    const customers = await this.usersRepository.count({
      where: { role: 'customer' as any },
    });
    const suppliers = await this.usersRepository.count({
      where: { role: 'supplier' as any },
    });
    const admins = await this.usersRepository.count({
      where: { role: 'admin' as any },
    });

    const pointsResult = await this.usersRepository
      .createQueryBuilder('user')
      .select('SUM(user.points)', 'totalPoints')
      .where('user.role != :role', { role: UserRole.ADMIN })
      .getRawOne();
    const totalPoints = parseInt(pointsResult?.totalPoints || '0', 10);

    const totalRequests =
      await this.usersRepository.manager.count(AccessoryRequest);
    const totalOffers = await this.usersRepository.manager.count(Offer);

    const manager = this.usersRepository.manager;
    const countBy = async (entity: any, column: string) =>
      Object.fromEntries(
        (
          await manager
            .createQueryBuilder(entity, 'e')
            .select(`e.${column}`, 'k')
            .addSelect('COUNT(*)', 'n')
            .groupBy(`e.${column}`)
            .getRawMany()
        ).map((r) => [r.k, Number(r.n)]),
      );

    // ponytail: averaged in JS over the latest 2000 answers; move to SQL if volume grows.
    const answers = await manager.find(RequestTarget, {
      where: { respondedAt: Not(IsNull()) },
      relations: ['request'],
      order: { respondedAt: 'DESC' },
      take: 2000,
    });
    const firstAnswer = new Map<string, number>();
    for (const t of answers) {
      const minutes = (new Date(t.respondedAt!).getTime() - new Date(t.request.createdAt).getTime()) / 60000;
      const prev = firstAnswer.get(t.request.id);
      if (prev === undefined || minutes < prev) firstAnswer.set(t.request.id, minutes);
    }
    const firstTimes = [...firstAnswer.values()];

    return {
      totalUsers,
      customers,
      suppliers,
      admins,
      agents: await this.usersRepository.count({ where: { role: UserRole.STAFF } }),
      totalPoints,
      totalRequests,
      totalOffers,
      requestsByStatus: await countBy(AccessoryRequest, 'status'),
      targetsByStatus: await countBy(RequestTarget, 'status'),
      unlocksByMethod: await countBy(ContactUnlock, 'via'),
      ...(await this.timeSeries(rangeDays)),
      avgFirstResponseMinutes: firstTimes.length
        ? Math.round(firstTimes.reduce((a, b) => a + b, 0) / firstTimes.length)
        : null,
    };
  }

  // Overview charts: new requests, new users, completed revenue over 14 days (daily),
  // 90 days (13 weekly buckets) or 365 days (12 ~monthly buckets). Bucket label = its start date (Libya).
  private async timeSeries(rangeDays: number) {
    const range = [14, 90, 365].includes(rangeDays) ? rangeDays : 14;
    const count = range === 14 ? 14 : range === 90 ? 13 : 12;
    const size = (range / count) * 86_400_000;
    const end = Date.now();
    const start = end - count * size;
    const label = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date(t));
    const since = new Date(start);
    const manager = this.usersRepository.manager;
    const [requests, users, payments] = await Promise.all([
      manager.find(AccessoryRequest, { where: { createdAt: MoreThanOrEqual(since) }, select: ['id', 'createdAt'] }),
      this.usersRepository.find({ where: { createdAt: MoreThanOrEqual(since) }, select: ['id', 'createdAt'] }),
      manager.find(PaymentTransaction, {
        where: { status: PaymentStatus.COMPLETED, updatedAt: MoreThanOrEqual(since) },
        select: ['id', 'amount', 'updatedAt'],
        loadEagerRelations: false,
      }),
    ]);
    const bucket = <T>(rows: T[], date: (r: T) => Date, value: (r: T) => number = () => 1) => {
      const sums = new Array(count).fill(0);
      for (const r of rows) {
        const i = Math.floor((new Date(date(r)).getTime() - start) / size);
        if (i >= 0 && i < count) sums[i] += value(r);
      }
      return sums.map((v, i) => ({ date: label(start + i * size), value: Math.round(v * 100) / 100 }));
    };
    return {
      seriesRange: range,
      requestsSeries: bucket(requests, (r) => r.createdAt),
      usersSeries: bucket(users, (u) => u.createdAt),
      revenueSeries: bucket(payments, (p) => p.updatedAt, (p) => Number(p.amount) || 0),
    };
  }

  async findPaginated(
    page: number,
    limit: number,
    search?: string,
    role?: UserRole,
  ): Promise<{ data: User[]; total: number }> {
    const base: any = role ? { role } : {};
    let where: any = base;
    if (search) {
      const cleanSearch = search.toLowerCase().trim();
      where = [
        { ...base, email: Like(`%${cleanSearch}%`) },
        { ...base, phoneNumber: Like(`%${cleanSearch}%`) },
        { ...base, fullName: Like(`%${cleanSearch}%`) },
        { ...base, companyName: Like(`%${cleanSearch}%`) },
      ];
    }

    const [data, total] = await this.usersRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Lookup latest payment / booking transactions for each user
    const userIds = data.map((u) => u.id).filter(Boolean);
    const txMap = new Map<string, PaymentTransaction>();
    if (userIds.length > 0) {
      try {
        const txs = await this.entityManager
          .createQueryBuilder(PaymentTransaction, 'tx')
          .innerJoinAndSelect('tx.user', 'user')
          .where('user.id IN (:...userIds)', { userIds })
          .orderBy('tx.createdAt', 'DESC')
          .getMany();

        for (const tx of txs) {
          const uid = tx.user?.id;
          if (!uid) continue;
          const current = txMap.get(uid);
          if (!current) {
            txMap.set(uid, tx);
          } else if (current.status !== PaymentStatus.COMPLETED && tx.status === PaymentStatus.COMPLETED) {
            txMap.set(uid, tx);
          }
        }
      } catch {
        // Fall back gracefully if table or join fails
      }
    }

    const planNamesAr: Record<string, string> = {
      elite: 'باقة 300 نقطة (النخبة)',
      pro: 'باقة 120 نقطة (الاحترافية)',
      basic: 'باقة 50 نقطة (الأساسية)',
      search_smart: 'البحث الذكي',
      search_normal: 'البحث العادي',
      free: 'باقة مجانية',
    };

    const enriched = data.map((u) => {
      const tx = txMap.get(u.id);
      let planId = u.activePlan || tx?.planId;
      if (!planId) {
        if (u.role === UserRole.ADMIN || u.role === UserRole.STAFF || u.role === UserRole.MODERATOR) {
          planId = 'pro';
        } else {
          planId = 'free';
        }
      }

      let planStatus = u.activePlanStatus || tx?.status;
      if (!planStatus) {
        planStatus = planId === 'free' ? 'free' : 'COMPLETED';
      }

      const planNameAr = planNamesAr[planId] || planId;

      return {
        ...u,
        activePlan: planId,
        activePlanName: planNameAr,
        activePlanStatus: planStatus,
        activePlanAmount: tx?.amount ?? null,
        activePlanDate: tx?.createdAt ?? null,
      };
    });

    return { data: enriched as any, total };
  }

  async updateUserPlan(id: string, planId: string, status?: string): Promise<User> {
    const user = await this.findById(id);
    user.activePlan = planId;
    user.activePlanStatus = status || 'COMPLETED';
    return this.usersRepository.save(user);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findById(id);
    user.role = role;
    return this.usersRepository.save(user);
  }

  async createAdminCreatedUser(data: any): Promise<User> {
    const { email, password, fullName, role } = data;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      fullName,
      role,
      points: 50, // default points
      isEmailVerified: true,
      isApproved: true,
      verificationStatus: 'approved',
    });

    return this.usersRepository.save(user);
  }

  async getMatches(): Promise<any[]> {
    const notifications = await this.usersRepository.manager.find(
      Notification,
      {
        order: { createdAt: 'DESC' },
        relations: ['sender', 'receiver', 'assignedMod'],
      },
    );

    const result: any[] = [];
    for (const notif of notifications) {
      let request: AccessoryRequest | null = null;
      let offer: Offer | null = null;

      if (notif.requestId) {
        request = await this.usersRepository.manager.findOne(AccessoryRequest, {
          where: { id: notif.requestId },
        });
      }

      if (notif.offerId) {
        offer = await this.usersRepository.manager.findOne(Offer, {
          where: { id: notif.offerId },
        });
      }

      result.push({
        id: notif.id,
        sender: {
          id: notif.sender.id,
          fullName: notif.sender.fullName,
          email: notif.sender.email,
          role: notif.sender.role,
          phoneNumber: notif.sender.phoneNumber,
          whatsapp: notif.sender.whatsapp,
          address: notif.sender.address,
          companyName: notif.sender.companyName,
          taxId: notif.sender.taxId,
          city: notif.sender.city,
          region: notif.sender.region,
        },
        receiver: {
          id: notif.receiver.id,
          fullName: notif.receiver.fullName,
          email: notif.receiver.email,
          role: notif.receiver.role,
          phoneNumber: notif.receiver.phoneNumber,
          whatsapp: notif.receiver.whatsapp,
          address: notif.receiver.address,
          companyName: notif.receiver.companyName,
          taxId: notif.receiver.taxId,
          city: notif.receiver.city,
          region: notif.receiver.region,
        },
        assignedMod: notif.assignedMod
          ? {
              id: notif.assignedMod.id,
              fullName: notif.assignedMod.fullName,
              email: notif.assignedMod.email,
            }
          : null,
        request: request
          ? {
              id: request.id,
              vehicleType: request.vehicleType,
              vehicleBrand: request.vehicleBrand,
              vehicleModel: request.vehicleModel,
              category: request.category,
              description: request.description,
              phoneNumber: request.phoneNumber,
              city: request.city,
              region: request.region,
              address: request.address,
            }
          : null,
        offer: offer
          ? {
              id: offer.id,
              price: offer.price,
              condition: offer.condition,
              deliveryTime: offer.deliveryTime,
              phoneNumber: offer.phoneNumber,
              city: offer.city,
              region: offer.region,
            }
          : null,
        message: notif.message,
        status: notif.status,
        createdAt: notif.createdAt,
      });
    }

    return result;
  }

  async assignMatch(
    matchId: string,
    moderatorId: string | null,
  ): Promise<void> {
    const notification = await this.usersRepository.manager.findOne(
      Notification,
      {
        where: { id: matchId },
      },
    );
    if (!notification) {
      throw new NotFoundException('Match notification not found.');
    }

    let moderator: User | null = null;
    if (moderatorId) {
      moderator = await this.usersRepository.findOne({
        where: { id: moderatorId, role: UserRole.MODERATOR },
      });
      if (!moderator) {
        throw new BadRequestException('Target user is not a moderator');
      }
    }

    notification.assignedMod = moderator;
    await this.usersRepository.manager.save(Notification, notification);
  }

  async deleteMatch(notificationId: string): Promise<void> {
    const notification = await this.usersRepository.manager.findOne(
      Notification,
      {
        where: { id: notificationId },
        relations: ['sender', 'receiver'],
      },
    );

    if (!notification) {
      throw new NotFoundException('Match notification not found.');
    }

    // 1. Revert request status to pending
    if (notification.requestId) {
      await this.usersRepository.manager.update(
        AccessoryRequest,
        notification.requestId,
        {
          status: RequestStatus.PENDING,
        },
      );
    }

    // 2. Revert offer status to pending
    if (notification.offerId) {
      await this.usersRepository.manager.update(Offer, notification.offerId, {
        status: OfferStatus.PENDING,
      });
    }

    const senderId = notification.sender.id;
    const receiverId = notification.receiver.id;

    // 3. Find and remove all existing accept/match notifications between these users for this request/offer
    const relatedNotifications = await this.usersRepository.manager.find(
      Notification,
      {
        where: [
          { id: notificationId },
          {
            sender: { id: receiverId },
            receiver: { id: senderId },
            requestId: notification.requestId,
            offerId: notification.offerId,
          },
        ],
      },
    );

    if (relatedNotifications.length > 0) {
      await this.usersRepository.manager.remove(
        Notification,
        relatedNotifications,
      );
    }

    // 4. Create clean alert notifications for both users notifying them of the match deletion
    const senderAlert = this.usersRepository.manager.create(Notification, {
      sender: notification.receiver,
      receiver: notification.sender,
      requestId: notification.requestId,
      offerId: notification.offerId,
      message: `⚠️ The match between you and ${notification.receiver.fullName} has been deleted by the administrator. The request/offer has been returned to pending.`,
      status: 'declined' as any,
    });
    await this.usersRepository.manager.save(Notification, senderAlert);

    const receiverAlert = this.usersRepository.manager.create(Notification, {
      sender: notification.sender,
      receiver: notification.receiver,
      requestId: notification.requestId,
      offerId: notification.offerId,
      message: `⚠️ The match between you and ${notification.sender.fullName} has been deleted by the administrator. The request/offer has been returned to pending.`,
      status: 'declined' as any,
    });
    await this.usersRepository.manager.save(Notification, receiverAlert);
  }

  async getModerators(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: UserRole.MODERATOR },
      order: { fullName: 'ASC' },
    });
  }

  async getMatchesForModerator(moderatorId: string): Promise<any[]> {
    const notifications = await this.usersRepository.manager.find(
      Notification,
      {
        where: { assignedMod: { id: moderatorId } },
        order: { createdAt: 'DESC' },
        relations: ['sender', 'receiver', 'assignedMod'],
      },
    );

    const result: any[] = [];
    for (const notif of notifications) {
      let request: AccessoryRequest | null = null;
      let offer: Offer | null = null;

      if (notif.requestId) {
        request = await this.usersRepository.manager.findOne(AccessoryRequest, {
          where: { id: notif.requestId },
        });
      }

      if (notif.offerId) {
        offer = await this.usersRepository.manager.findOne(Offer, {
          where: { id: notif.offerId },
        });
      }

      result.push({
        id: notif.id,
        sender: {
          id: notif.sender.id,
          fullName: notif.sender.fullName,
          email: notif.sender.email,
          role: notif.sender.role,
          phoneNumber: notif.sender.phoneNumber,
          whatsapp: notif.sender.whatsapp,
          address: notif.sender.address,
          companyName: notif.sender.companyName,
          taxId: notif.sender.taxId,
          city: notif.sender.city,
          region: notif.sender.region,
        },
        receiver: {
          id: notif.receiver.id,
          fullName: notif.receiver.fullName,
          email: notif.receiver.email,
          role: notif.receiver.role,
          phoneNumber: notif.receiver.phoneNumber,
          whatsapp: notif.receiver.whatsapp,
          address: notif.receiver.address,
          companyName: notif.receiver.companyName,
          taxId: notif.receiver.taxId,
          city: notif.receiver.city,
          region: notif.receiver.region,
        },
        assignedMod: notif.assignedMod
          ? {
              id: notif.assignedMod.id,
              fullName: notif.assignedMod.fullName,
              email: notif.assignedMod.email,
            }
          : null,
        request: request
          ? {
              id: request.id,
              vehicleType: request.vehicleType,
              vehicleBrand: request.vehicleBrand,
              vehicleModel: request.vehicleModel,
              category: request.category,
              description: request.description,
              phoneNumber: request.phoneNumber,
              city: request.city,
              region: request.region,
              address: request.address,
            }
          : null,
        offer: offer
          ? {
              id: offer.id,
              price: offer.price,
              condition: offer.condition,
              deliveryTime: offer.deliveryTime,
              phoneNumber: offer.phoneNumber,
              city: offer.city,
              region: offer.region,
            }
          : null,
        message: notif.message,
        status: notif.status,
        createdAt: notif.createdAt,
      });
    }

    return result;
  }

  async toggleUserActive(id: string, isActive: boolean): Promise<User> {
    const user = await this.findById(id);
    user.isActive = isActive;
    return this.usersRepository.save(user);
  }

  async createAdminNotification(
    type: string,
    title: string,
    message: string,
  ): Promise<AdminNotification> {
    const notif = this.adminNotificationsRepository.create({
      type,
      title,
      message,
    });
    return this.adminNotificationsRepository.save(notif);
  }

  async getAdminNotifications(): Promise<AdminNotification[]> {
    return this.adminNotificationsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getAdminNotificationsPaginated(
    page = 1,
    limit = 10,
  ): Promise<{
    data: AdminNotification[];
    total: number;
    unreadCount: number;
  }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.adminNotificationsRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: skip,
    });
    const unreadCount = await this.adminNotificationsRepository.count({
      where: { isRead: false },
    });
    return { data, total, unreadCount };
  }

  async markAllAdminNotificationsRead(): Promise<void> {
    await this.adminNotificationsRepository.update({ isRead: false }, { isRead: true });
  }

  async uploadSupplierDocuments(
    userId: string,
    documentUrls: string[],
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.verificationDocuments = documentUrls;
    user.verificationStatus = 'pending';
    user.isApproved = false;
    return this.usersRepository.save(user);
  }

  async getPendingSuppliers(): Promise<User[]> {
    const suppliers = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.SUPPLIER })
      .andWhere('user.verificationStatus = :status', { status: 'pending' })
      .orderBy('user.createdAt', 'DESC')
      .getMany();

    const baseUrl = process.env.APP_URL;
    return suppliers.map((user) => {
      if (user.verificationDocuments && Array.isArray(user.verificationDocuments)) {
        user.verificationDocuments = user.verificationDocuments.map((doc) => {
          if (!doc) return '';
          if (doc.startsWith('http://') || doc.startsWith('https://')) {
            return doc;
          }
          const cleanPath = doc.startsWith('/') ? doc : `/${doc}`;
          if (baseUrl) {
            const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            return `${cleanBase}${cleanPath}`;
          }
          return cleanPath;
        });
      }
      return user;
    });
  }

  async approveSupplier(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isApproved = true;
    user.verificationStatus = 'approved';
    return this.usersRepository.save(user);
  }

  async rejectSupplier(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Rejecting deletes the account: only ever for supplier accounts.
    if (user.role !== UserRole.SUPPLIER) {
      throw new BadRequestException('Only supplier accounts can be rejected');
    }
    await this.usersRepository.remove(user);
    return user;
  }
}
