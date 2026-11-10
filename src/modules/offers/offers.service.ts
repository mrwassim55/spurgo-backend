import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Offer, OfferStatus } from './entities/offer.entity';
import { ContactUnlock } from './entities/contact-unlock.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { AccessoryRequest, RequestStatus } from '../requests/entities/accessory-request.entity';
import { PaymentTransaction, PaymentStatus } from '../payments/entities/payment-transaction.entity';
import { PaymentPlan } from '../payments/entities/payment-plan.entity';
import { UsersService } from '../users/users.service';
import { RequestsService, requestRef } from '../requests/requests.service';
import { decideUnlock, isTrialActive } from '../users/rules';

export type Viewer = { id: string; role: string };
export const SEARCH_PLANS = ['search_normal', 'search_smart'];
const isStaff = (v: Viewer) => v.role === UserRole.ADMIN || v.role === UserRole.STAFF;

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer)
    private offersRepository: Repository<Offer>,
    @InjectRepository(AccessoryRequest)
    private requestsRepository: Repository<AccessoryRequest>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(ContactUnlock)
    private unlocksRepository: Repository<ContactUnlock>,
    @InjectRepository(PaymentTransaction)
    private transactionsRepository: Repository<PaymentTransaction>,
    @InjectRepository(PaymentPlan)
    private plansRepository: Repository<PaymentPlan>,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
    private requestsService: RequestsService,
  ) {}

  // Masking (client doc §3): store identity/contact stays server-side until unlocked ----------

  async unlockedOfferIds(viewer: Viewer): Promise<Set<string>> {
    const rows = await this.unlocksRepository.find({
      where: { user: { id: viewer.id } },
      relations: ['offer'],
    });
    return new Set(rows.map((r) => r.offer?.id).filter(Boolean));
  }

  maskOffer(offer: Offer, viewer: Viewer, unlocked: Set<string>) {
    const open = isStaff(viewer) || offer.supplier?.id === viewer.id || unlocked.has(offer.id);
    if (open) return { ...offer, locked: false };
    return {
      ...offer,
      phoneNumber: null,
      supplier: offer.supplier ? { city: offer.supplier.city, region: offer.supplier.region } : null,
      locked: true,
    };
  }

  private async maskAll(offers: Offer[], viewer: Viewer) {
    const unlocked = await this.unlockedOfferIds(viewer);
    return offers.map((o) => this.maskOffer(o, viewer, unlocked));
  }

  // Create ---------------------------------------------------------------------------------

  async create(createOfferDto: CreateOfferDto, actor: Viewer): Promise<Offer> {
    // Never let the body set server-owned fields.
    const {
      id, status, supplier, request: _r, completedAt, ratingRequestedAt, rating, ratingComment,
      supplierId: onBehalfOf, ...dto
    } = createOfferDto as any;

    let supplierId = actor.id;
    let agent: Viewer | null = null;
    if (onBehalfOf && onBehalfOf !== actor.id) {
      if (!isStaff(actor)) throw new ForbiddenException('Only agents can add offers for a store');
      const store = await this.usersRepository.findOne({ where: { id: onBehalfOf, role: UserRole.SUPPLIER } });
      if (!store) throw new BadRequestException('supplierId is not a store');
      supplierId = store.id;
      agent = actor;
    }

    let request: AccessoryRequest | null = null;
    let saved: Offer;

    if (dto.requestId) {
      request = await this.requestsRepository.findOne({
        where: { id: dto.requestId },
        relations: ['user'],
      });
      if (!request) {
        throw new NotFoundException(`Request with ID ${dto.requestId} not found`);
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new BadRequestException('This request is no longer accepting offers');
      }
    }

    // One pending offer per store per request: update instead of duplicating.
    const existingOffer = request
      ? await this.offersRepository.findOne({
          where: { request: { id: request.id }, supplier: { id: supplierId }, status: OfferStatus.PENDING },
        })
      : null;

    if (existingOffer) {
      existingOffer.price = dto.price ?? existingOffer.price;
      existingOffer.condition = dto.condition ?? existingOffer.condition;
      existingOffer.deliveryTime = dto.deliveryTime ?? existingOffer.deliveryTime;
      existingOffer.notes = dto.notes ?? existingOffer.notes;
      if (dto.phoneNumber) existingOffer.phoneNumber = dto.phoneNumber;
      saved = await this.offersRepository.save(existingOffer);
    } else {
      saved = await this.offersRepository.save(
        this.offersRepository.create({
          ...dto,
          supplier: { id: supplierId } as User,
          request: request ? ({ id: request.id } as AccessoryRequest) : undefined,
          inStore: dto.inStore ?? !request,
          quantity: dto.quantity ?? 1,
          vehicleBrand: dto.vehicleBrand || request?.vehicleBrand || undefined,
          vehicleModel: dto.vehicleModel || request?.vehicleModel || undefined,
          vehicleYear: dto.vehicleYear || request?.vehicleYear || undefined,
          vehicleEngine: dto.vehicleEngine || request?.vehicleEngine || undefined,
          fuelType: dto.fuelType || request?.fuelType || undefined,
          category: dto.category || request?.category || undefined,
          vehicleType: dto.vehicleType || request?.vehicleType || undefined,
          manufactureCountry: dto.manufactureCountry || request?.manufactureCountry || undefined,
          brandOriginCountry: dto.brandOriginCountry || undefined,
          phoneNumber: dto.phoneNumber || undefined,
        }) as unknown as Offer,
      );
    }

    if (request) {
      await this.requestsService.markOffered(request.id, supplierId);
      if (agent) {
        await this.requestsService.addLog(request.id, agent, 'system', `أضاف المندوب عرضاً نيابة عن متجر بسعر ${saved.price}`);
      }
      // No store name or price in the customer's notification: that is what unlocking is for.
      if (request.user && !existingOffer) {
        const brandModel = `${request.vehicleBrand || ''} ${request.vehicleModel || ''}`.trim();
        await this.notificationsService
          .sendSystemNotification(
            request.user.id,
            'عرض جديد على طلبك',
            `🏷️ وصلك عرض جديد لطلب ${brandModel} #${requestRef(request.id)}`,
            'new_offer',
            { requestId: request.id, offerId: saved.id },
          )
          .catch((e) => console.error('Failed to notify customer about offer:', e));
      }
    }

    return saved;
  }

  // Read -----------------------------------------------------------------------------------

  async findByRequest(requestId: string, viewer: Viewer) {
    const offers = await this.offersRepository.find({
      where: { request: { id: requestId } },
      relations: ['supplier'],
      order: { createdAt: 'DESC' },
    });
    return this.maskAll(offers, viewer);
  }

  async findMyOffers(supplierId: string): Promise<Offer[]> {
    return this.offersRepository.find({
      where: { supplier: { id: supplierId } },
      relations: ['request'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(viewer: Viewer) {
    const offers = await this.offersRepository.find({
      relations: ['supplier', 'request'],
      order: { createdAt: 'DESC' },
    });
    return this.maskAll(offers, viewer);
  }

  // Unlock (client doc §3, §7.4): trial -> paid search credit -> points -> 402 ----------------

  async unlock(offerId: string, viewer: Viewer, method?: string) {
    const offer = await this.offersRepository.findOne({
      where: { id: offerId },
      relations: ['supplier', 'request'],
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (isStaff(viewer) || offer.supplier?.id === viewer.id) return { ...offer, locked: false };

    const [user, settings, existing, credit] = await Promise.all([
      this.usersService.findById(viewer.id),
      this.usersService.getSettings(),
      this.unlocksRepository.findOne({ where: { user: { id: viewer.id }, offer: { id: offerId } } }),
      this.transactionsRepository.findOne({
        where: {
          user: { id: viewer.id },
          status: PaymentStatus.COMPLETED,
          planId: In(SEARCH_PLANS),
          usedAt: IsNull(),
        },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const decision = decideUnlock({
      alreadyUnlocked: !!existing,
      trialActive: isTrialActive(user.trialEndsAt, settings),
      hasCredit: !!credit,
      wantsPoints: method === 'points',
      points: user.points,
      cost: settings.consumptionRate,
    });

    if (decision === 'payment_required') {
      const plans = await this.plansRepository.find({
        where: { planId: In(SEARCH_PLANS), isActive: true },
        order: { sortOrder: 'ASC' },
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'PAYMENT_REQUIRED',
          plans,
          pointsCost: settings.consumptionRate,
          points: user.points,
          trialEndsAt: user.trialEndsAt,
          shopOpenHour: settings.shopOpenHour,
          shopCloseHour: settings.shopCloseHour,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (decision !== 'already') {
      const via = decision === 'credit' ? credit!.planId : decision;
      let unlock: ContactUnlock;
      try {
        // Insert first: the unique (user, offer) index stops a double tap from charging twice.
        unlock = await this.unlocksRepository.save(
          this.unlocksRepository.create({ user: { id: viewer.id }, offer: { id: offerId }, via }),
        );
      } catch {
        return { ...offer, locked: false }; // concurrent unlock already happened
      }
      try {
        if (decision === 'credit') {
          const used = await this.transactionsRepository.update(
            { id: credit!.id, usedAt: IsNull() },
            { usedAt: new Date(), usedForOfferId: offerId },
          );
          if (!used.affected) throw new BadRequestException('Search credit already used, try again');
        } else if (decision === 'points') {
          await this.usersService.spendPoints(viewer.id, settings.consumptionRate, 'unlock', {
            ref: offerId,
            requestId: offer.request?.id,
          });
        }
      } catch (e) {
        await this.unlocksRepository.remove(unlock);
        throw e;
      }
    }
    return { ...offer, locked: false };
  }

  // Sale + rating (client doc §8 / §8.1) -----------------------------------------------------

  private async loadForRequestOwner(offerId: string) {
    const offer = await this.offersRepository.findOne({
      where: { id: offerId },
      relations: ['supplier', 'request', 'request.user'],
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (!offer.request) throw new BadRequestException('Only offers made on a request can be completed or rated');
    return offer;
  }

  async complete(offerId: string, actor: Viewer) {
    const offer = await this.loadForRequestOwner(offerId);
    if (!isStaff(actor) && offer.request.user?.id !== actor.id) {
      throw new ForbiddenException('Only the customer or an agent can confirm the sale');
    }
    if (offer.completedAt) return offer;

    offer.completedAt = new Date();
    offer.status = OfferStatus.ACCEPTED;
    await this.offersRepository.save(offer);
    // Completing the request also stops store nudges.
    await this.requestsRepository.update(offer.request.id, { status: RequestStatus.COMPLETED });
    await this.usersService.award(offer.supplier.id, 'sale', { requestId: offer.request.id, ref: offer.id });
    if (isStaff(actor)) {
      await this.requestsService.addLog(offer.request.id, actor, 'system', 'أكد المندوب إتمام البيع');
    }
    return offer;
  }

  async requestRating(offerId: string, supplierId: string) {
    const offer = await this.loadForRequestOwner(offerId);
    if (offer.supplier?.id !== supplierId) throw new ForbiddenException('Not your offer');
    if (!offer.completedAt) throw new BadRequestException('Confirm the sale first');
    if (offer.ratingRequestedAt) return offer;

    offer.ratingRequestedAt = new Date();
    await this.offersRepository.save(offer);
    if (offer.request.user) {
      await this.notificationsService.sendSystemNotification(
        offer.request.user.id,
        'كيف كانت تجربتك؟',
        `قيّم تجربتك مع طلب #${requestRef(offer.request.id)} واحصل على نقاط`,
        'rate_request',
        { requestId: offer.request.id, offerId: offer.id },
      );
    }
    await this.usersService.award(supplierId, 'rating_request', { requestId: offer.request.id, ref: offer.id });
    return offer;
  }

  async rate(offerId: string, customerId: string, stars: number, comment?: string) {
    const offer = await this.loadForRequestOwner(offerId);
    if (offer.request.user?.id !== customerId) throw new ForbiddenException('Only the customer can rate');
    if (!offer.completedAt) throw new BadRequestException('Confirm the sale first');
    if (offer.rating) throw new BadRequestException('Already rated');
    const value = Math.round(Number(stars));
    if (!(value >= 1 && value <= 5)) throw new BadRequestException('stars must be 1..5');

    offer.rating = value;
    offer.ratingComment = comment?.trim() || undefined;
    await this.offersRepository.save(offer);
    const opts = { requestId: offer.request.id, ref: offer.id };
    await this.usersService.award(customerId, 'customer_rating', opts);
    await this.usersService.award(offer.supplier.id, 'rated', opts);
    return offer;
  }

  // Existing -------------------------------------------------------------------------------

  async updateQuantity(id: string, quantity: number, supplierId: string): Promise<Offer> {
    const offer = await this.offersRepository.findOne({
      where: { id },
      relations: ['supplier'],
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    if (offer.supplier.id !== supplierId) {
      throw new ForbiddenException('You are not authorized to update this offer');
    }

    offer.quantity = quantity;
    return this.offersRepository.save(offer);
  }

  async remove(id: string, supplierId: string): Promise<void> {
    const offer = await this.offersRepository.findOne({
      where: { id },
      relations: ['supplier'],
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    if (offer.supplier.id !== supplierId) {
      throw new ForbiddenException('You are not authorized to delete this offer');
    }

    await this.offersRepository.remove(offer);
  }

  async adminRemove(id: string): Promise<void> {
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }
    await this.offersRepository.remove(offer);
  }
}
