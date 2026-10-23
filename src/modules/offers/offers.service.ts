import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Offer, OfferStatus } from './entities/offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { AccessoryRequest } from '../requests/entities/accessory-request.entity';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer)
    private offersRepository: Repository<Offer>,
    @InjectRepository(AccessoryRequest)
    private requestsRepository: Repository<AccessoryRequest>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  async create(
    createOfferDto: CreateOfferDto,
    supplierId: string,
  ): Promise<Offer> {
    let request: AccessoryRequest | null = null;

    if (createOfferDto.requestId) {
      request = await this.requestsRepository.findOne({
        where: { id: createOfferDto.requestId },
        relations: ['user'],
      });

      if (!request) {
        throw new NotFoundException(
          `Request with ID ${createOfferDto.requestId} not found`,
        );
      }

      // Check if this supplier already sent a pending offer for this request to prevent duplicate spam
      const existingOffer = await this.offersRepository.findOne({
        where: {
          request: { id: createOfferDto.requestId },
          supplier: { id: supplierId },
          status: OfferStatus.PENDING,
        },
      });

      if (existingOffer) {
        existingOffer.price = createOfferDto.price ?? existingOffer.price;
        existingOffer.condition = createOfferDto.condition ?? existingOffer.condition;
        existingOffer.deliveryTime = createOfferDto.deliveryTime ?? existingOffer.deliveryTime;
        existingOffer.notes = createOfferDto.notes ?? existingOffer.notes;
        if (createOfferDto.phoneNumber) {
          existingOffer.phoneNumber = createOfferDto.phoneNumber;
        }
        return this.offersRepository.save(existingOffer);
      }
    }

    const offer = this.offersRepository.create({
      ...createOfferDto,
      supplier: { id: supplierId } as any,
      request: request ? ({ id: createOfferDto.requestId } as any) : undefined,
      inStore:
        createOfferDto.inStore ?? (createOfferDto.requestId ? false : true),
      quantity: createOfferDto.quantity ?? 1,
      vehicleBrand:
        createOfferDto.vehicleBrand || request?.vehicleBrand || undefined,
      vehicleModel:
        createOfferDto.vehicleModel || request?.vehicleModel || undefined,
      vehicleYear:
        createOfferDto.vehicleYear || request?.vehicleYear || undefined,
      vehicleEngine:
        createOfferDto.vehicleEngine || request?.vehicleEngine || undefined,
      fuelType: createOfferDto.fuelType || request?.fuelType || undefined,
      category: createOfferDto.category || request?.category || undefined,
      vehicleType:
        createOfferDto.vehicleType || request?.vehicleType || undefined,
      manufactureCountry:
        createOfferDto.manufactureCountry ||
        request?.manufactureCountry ||
        undefined,
      brandOriginCountry: createOfferDto.brandOriginCountry || undefined,
      phoneNumber: createOfferDto.phoneNumber || undefined,
    });

    const savedOffer = await this.offersRepository.save(offer);

    // Send notification to the request owner (customer) if an offer was submitted for their request
    if (request && request.user && request.user.id !== supplierId) {
      try {
        const supplier = await this.usersRepository.findOne({
          where: { id: supplierId },
        });
        const supplierName = supplier ? supplier.fullName : 'A supplier';
        const brandModel = `${request.vehicleBrand || ''} ${request.vehicleModel || ''}`.trim();
        const priceText = savedOffer.price ? ` ($${savedOffer.price})` : '';

        await this.notificationsService.create(
          {
            receiverId: request.user.id,
            requestId: request.id,
            offerId: savedOffer.id,
            message: `🏷️ You received a new offer${priceText} from ${supplierName} for your ${brandModel} request!`,
          },
          supplierId,
        );
      } catch (e) {
        console.error('Failed to create notification for submitted offer:', e);
      }
    }

    return savedOffer;
  }

  async findByRequest(requestId: string): Promise<Offer[]> {
    return this.offersRepository.find({
      where: { request: { id: requestId } },
      relations: ['supplier'],
      order: { createdAt: 'DESC' },
    });
  }

  async findMyOffers(supplierId: string): Promise<Offer[]> {
    return this.offersRepository.find({
      where: { supplier: { id: supplierId } },
      relations: ['request'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Offer[]> {
    return this.offersRepository.find({
      relations: ['supplier', 'request'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateQuantity(
    id: string,
    quantity: number,
    supplierId: string,
  ): Promise<Offer> {
    const offer = await this.offersRepository.findOne({
      where: { id },
      relations: ['supplier'],
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    if (offer.supplier.id !== supplierId) {
      throw new ForbiddenException(
        'You are not authorized to update this offer',
      );
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
      throw new ForbiddenException(
        'You are not authorized to delete this offer',
      );
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
