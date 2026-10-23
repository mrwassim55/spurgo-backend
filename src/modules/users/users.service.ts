import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, EntityManager } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { SystemConfig } from './entities/system-config.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { PointsAction, DEFAULT_SIGNUP_POINTS } from './points.config';
import {
  AccessoryRequest,
  RequestStatus,
} from '../requests/entities/accessory-request.entity';
import { Offer, OfferStatus } from '../offers/entities/offer.entity';
import { Notification } from '../notifications/entities/notification.entity';
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
    private readonly entityManager: EntityManager,
  ) {}

  async onModuleInit() {
    await this.ensureConfig('signupPoints', DEFAULT_SIGNUP_POINTS.toString());
    await this.ensureConfig('consumptionRate', '25');

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

  async getPointsConfig(): Promise<{
    signupPoints: number;
    consumptionRate: number;
  }> {
    const signupPointsEntry = await this.configRepository.findOne({
      where: { key: 'signupPoints' },
    });
    const consumptionRateEntry = await this.configRepository.findOne({
      where: { key: 'consumptionRate' },
    });

    return {
      signupPoints: parseInt(
        signupPointsEntry?.value || DEFAULT_SIGNUP_POINTS.toString(),
        10,
      ),
      consumptionRate: parseInt(consumptionRateEntry?.value || '25', 10),
    };
  }

  async updatePointsConfig(
    signupPoints: number,
    consumptionRate: number,
  ): Promise<any> {
    if (signupPoints !== undefined && signupPoints !== null) {
      const signupPointsNum =
        typeof signupPoints === 'number'
          ? signupPoints
          : parseInt(String(signupPoints), 10);

      // 1. Get the current old signup points config value
      const signupPointsEntry = await this.configRepository.findOne({
        where: { key: 'signupPoints' },
      });
      const oldSignupPoints = signupPointsEntry
        ? parseInt(signupPointsEntry.value, 10)
        : DEFAULT_SIGNUP_POINTS;

      // 2. Save the new signup points config
      await this.configRepository.save({
        key: 'signupPoints',
        value: signupPointsNum.toString(),
      });

      // 3. Update points of all users who haven't spent any points yet (excluding admins)
      // i.e., user.points === oldSignupPoints OR user.points === DEFAULT_SIGNUP_POINTS
      // and they have 0 requests and 0 offers
      if (signupPointsNum !== oldSignupPoints) {
        const usersToUpdate = await this.usersRepository.find({
          where: [
            { points: oldSignupPoints },
            { points: DEFAULT_SIGNUP_POINTS },
          ],
        });

        for (const user of usersToUpdate) {
          if (user.role !== UserRole.ADMIN) {
            const requestCount = await this.entityManager
              .createQueryBuilder()
              .select('id')
              .from('accessory_requests', 'req')
              .where('req.userId = :userId', { userId: user.id })
              .getCount();

            const offerCount = await this.entityManager
              .createQueryBuilder()
              .select('id')
              .from('offers', 'off')
              .where('off.supplierId = :supplierId', { supplierId: user.id })
              .getCount();

            if (requestCount === 0 && offerCount === 0) {
              user.points = signupPointsNum;
              await this.usersRepository.save(user);
            }
          }
        }
      }
    }
    if (consumptionRate !== undefined && consumptionRate !== null) {
      const consumptionRateNum =
        typeof consumptionRate === 'number'
          ? consumptionRate
          : parseInt(String(consumptionRate), 10);
      await this.configRepository.save({
        key: 'consumptionRate',
        value: consumptionRateNum.toString(),
      });
    }
    return this.getPointsConfig();
  }

  async consumePoints(id: string, action: PointsAction): Promise<User> {
    const user = await this.findById(id);
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPPLIER) {
      return user;
    }

    const config = await this.getPointsConfig();
    const cost = config.consumptionRate;

    if (user.points < cost) {
      throw new BadRequestException('Insufficient points');
    }

    user.points -= cost;
    return this.usersRepository.save(user);
  }

  async addPoints(id: string, amount: number): Promise<User> {
    const user = await this.findById(id);
    user.points += amount;
    return this.usersRepository.save(user);
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
    user.points = pointsNum;
    return this.usersRepository.save(user);
  }

  async getSystemStats(): Promise<any> {
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

    return {
      totalUsers,
      customers,
      suppliers,
      admins,
      totalPoints,
      totalRequests,
      totalOffers,
    };
  }

  async findPaginated(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ data: User[]; total: number }> {
    let where: any = {};
    if (search) {
      const cleanSearch = search.toLowerCase().trim();
      where = [
        { email: Like(`%${cleanSearch}%`) },
        { phoneNumber: Like(`%${cleanSearch}%`) },
        { fullName: Like(`%${cleanSearch}%`) },
      ];
    }

    const [data, total] = await this.usersRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
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
    await this.usersRepository.remove(user);
    return user;
  }
}
