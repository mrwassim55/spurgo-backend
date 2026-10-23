import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessoryRequest } from './entities/accessory-request.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(AccessoryRequest)
    private requestsRepository: Repository<AccessoryRequest>,
  ) {}

  async create(
    createRequestDto: CreateRequestDto,
    user: User,
  ): Promise<AccessoryRequest> {
    // Prevent double-submission of requests (idempotency guard)
    const existingDuplicate = await this.requestsRepository.findOne({
      where: {
        user: { id: user.id },
        vehicleBrand: createRequestDto.vehicleBrand,
        vehicleModel: createRequestDto.vehicleModel,
        vehicleYear: createRequestDto.vehicleYear,
        description: createRequestDto.description,
      },
      order: { createdAt: 'DESC' },
    });

    if (existingDuplicate) {
      const tenSecondsAgo = Date.now() - 10000;
      if (existingDuplicate.createdAt.getTime() > tenSecondsAgo) {
        return existingDuplicate;
      }
    }

    const request = this.requestsRepository.create({
      ...createRequestDto,
      user: user,
    });
    return this.requestsRepository.save(request);
  }

  async findAllByUser(user: User): Promise<AccessoryRequest[]> {
    return this.requestsRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<AccessoryRequest[]> {
    return this.requestsRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async findOne(id: string): Promise<AccessoryRequest | null> {
    return this.requestsRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const request = await this.requestsRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException(`Request with ID ${id} not found`);
    }

    if (request.user.id !== userId) {
      throw new ForbiddenException(
        'You are not authorized to delete this request',
      );
    }

    await this.requestsRepository.remove(request);
  }

  async adminRemove(id: string): Promise<void> {
    const request = await this.requestsRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Request with ID ${id} not found`);
    }
    await this.requestsRepository.remove(request);
  }
}
