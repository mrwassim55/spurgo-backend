import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationStatus,
} from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { ContactUnlock } from '../offers/entities/contact-unlock.entity';
import {
  AccessoryRequest,
  RequestStatus,
} from '../requests/entities/accessory-request.entity';
import { Offer, OfferStatus } from '../offers/entities/offer.entity';

import { FcmService } from './fcm.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AccessoryRequest)
    private readonly requestsRepository: Repository<AccessoryRequest>,
    @InjectRepository(Offer)
    private readonly offersRepository: Repository<Offer>,
    @InjectRepository(ContactUnlock)
    private readonly unlocksRepository: Repository<ContactUnlock>,
    private readonly fcmService: FcmService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
    senderId: string,
  ): Promise<Notification> {
    const { receiverId, requestId, offerId, message } = createNotificationDto;

    if (senderId === receiverId) {
      throw new BadRequestException(
        'You cannot send a match request to yourself.',
      );
    }

    const sender = await this.usersRepository.findOne({
      where: { id: senderId },
    });
    const receiver = await this.usersRepository.findOne({
      where: { id: receiverId },
    });

    if (!sender || !receiver) {
      throw new NotFoundException('Sender or Receiver not found.');
    }

    // Paywall (client doc §3): a customer can only reach a store they unlocked.
    if (sender.role === UserRole.CUSTOMER && receiver.role === UserRole.SUPPLIER) {
      if (!(await this.hasUnlockedStore(senderId, receiverId))) {
        throw new HttpException(
          { statusCode: HttpStatus.PAYMENT_REQUIRED, message: 'PAYMENT_REQUIRED' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    // Check if duplicate match request already exists
    const existing = await this.notificationsRepository.findOne({
      where: {
        sender: { id: senderId },
        receiver: { id: receiverId },
        requestId,
        offerId,
        status: NotificationStatus.PENDING,
      },
    });

    if (existing) {
      return existing;
    }

    const notification = this.notificationsRepository.create({
      sender,
      receiver,
      requestId,
      offerId,
      message:
        message ||
        `Hey! ${sender.fullName} wants to match and connect with you.`,
      status: NotificationStatus.PENDING,
    });

    const saved = await this.notificationsRepository.save(notification);

    // Trigger Device Push Notification to Receiver
    try {
      await this.fcmService.sendPushNotification(
        receiver.fcmToken,
        'New Match Request! 🤝',
        saved.message,
        {
          notifId: saved.id,
          type: 'match_request',
          requestId: requestId || '',
          offerId: offerId || '',
        },
      );
    } catch (err) {
      console.error('Failed to dispatch FCM push notification:', err);
    }

    return saved;
  }

  private async hasUnlockedStore(customerId: string, storeId: string): Promise<boolean> {
    const count = await this.unlocksRepository.count({
      where: { user: { id: customerId }, offer: { supplier: { id: storeId } } },
    });
    return count > 0;
  }

  async findAll(userId: string, type?: string) {
    const list = await this.notificationsRepository.find({
      where:
        type === 'all'
          ? [{ receiver: { id: userId } }, { sender: { id: userId } }]
          : { receiver: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    const viewer = await this.usersRepository.findOne({ where: { id: userId } });
    if (viewer?.role !== UserRole.CUSTOMER) return list;

    // Customers only see a store's identity once the store accepted the match or they unlocked it.
    const unlockedStores = new Set(
      (
        await this.unlocksRepository.find({
          where: { user: { id: userId } },
          relations: ['offer', 'offer.supplier'],
        })
      ).map((u) => u.offer?.supplier?.id),
    );
    const hide = (u: User | null, n: Notification) =>
      u && u.id !== userId && u.role === UserRole.SUPPLIER &&
      n.status !== NotificationStatus.ACCEPTED && !unlockedStores.has(u.id)
        ? { id: u.id, role: u.role, city: u.city, locked: true }
        : u;
    return list.map((n) => ({ ...n, sender: hide(n.sender, n), receiver: hide(n.receiver, n) }));
  }

  async acceptMatch(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
      relations: ['sender', 'receiver'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    if (notification.receiver.id !== userId) {
      throw new BadRequestException(
        'You are not authorized to accept this match request.',
      );
    }

    notification.status = NotificationStatus.ACCEPTED;
    await this.notificationsRepository.save(notification);

    // Create reciprocal accepted notification for the original sender
    const acceptedNotif = this.notificationsRepository.create({
      sender: notification.receiver,
      receiver: notification.sender,
      requestId: notification.requestId,
      offerId: notification.offerId,
      message: `🎉 Great news! ${notification.receiver.fullName} accepted your match request! You can now view their details and contact them.`,
      status: NotificationStatus.ACCEPTED,
    });
    const savedAccepted = await this.notificationsRepository.save(acceptedNotif);

    // Trigger Device Push Notification to Original Sender
    try {
      await this.fcmService.sendPushNotification(
        notification.sender.fcmToken,
        'Match Accepted! 🎉',
        savedAccepted.message,
        {
          notifId: savedAccepted.id,
          type: 'match_accepted',
          requestId: notification.requestId || '',
          offerId: notification.offerId || '',
        },
      );
    } catch (err) {
      console.error('Failed to dispatch FCM push for accepted match:', err);
    }

    // If there is an associated request, mark it as matched/completed
    if (notification.requestId) {
      await this.requestsRepository.update(notification.requestId, {
        status: RequestStatus.COMPLETED,
      });
    }

    // If there is an associated offer, mark it as accepted
    if (notification.offerId) {
      await this.offersRepository.update(notification.offerId, {
        status: OfferStatus.ACCEPTED,
      });
    }

    return notification;
  }

  async declineMatch(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
      relations: ['sender', 'receiver'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    if (notification.receiver.id !== userId) {
      throw new BadRequestException(
        'You are not authorized to decline this match request.',
      );
    }

    notification.status = NotificationStatus.DECLINED;
    return this.notificationsRepository.save(notification);
  }

  async broadcast(audience: string, title: string, message: string): Promise<{ sent: number }> {
    if (!title?.trim() || !message?.trim()) throw new BadRequestException('title and message are required');
    const roles = ['customer', 'supplier', 'staff'];
    if (audience !== 'all' && !roles.includes(audience)) {
      throw new BadRequestException('audience must be all, customer, supplier or staff');
    }
    const users = await this.usersRepository.find({
      where: audience === 'all'
        ? roles.map((role) => ({ role: role as UserRole, isActive: true }))
        : { role: audience as UserRole, isActive: true },
    });
    // ponytail: sequential sends; batch with FCM sendEach if audiences grow to thousands.
    for (const u of users) {
      await this.sendSystemNotification(u.id, title.trim(), message.trim(), 'broadcast');
    }
    return { sent: users.length };
  }

  async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    type: string = 'system',
    data?: any,
  ): Promise<Notification | null> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    const notification = this.notificationsRepository.create({
      sender: user,
      receiver: user,
      message: `${title}: ${message}`,
      status: NotificationStatus.ACCEPTED,
    });
    const saved = await this.notificationsRepository.save(notification);

    if (user.fcmToken) {
      try {
        await this.fcmService.sendPushNotification(user.fcmToken, title, message, {
          notifId: saved.id,
          type,
          ...(data || {}),
        });
      } catch (e) {
        // Ignore FCM send errors
      }
    }
    return saved;
  }
}
