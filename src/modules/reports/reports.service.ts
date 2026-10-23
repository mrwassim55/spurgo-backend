import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity';
import { AccessoryRequest } from '../requests/entities/accessory-request.entity';
import { Offer } from '../offers/entities/offer.entity';
import { Notification } from '../notifications/entities/notification.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}

  async create(
    reporterId: string,
    targetType: string,
    targetId: string,
    description?: string,
  ): Promise<Report> {
    const cleanType = targetType.toLowerCase().trim();
    if (
      cleanType !== 'request' &&
      cleanType !== 'offer' &&
      cleanType !== 'support'
    ) {
      throw new BadRequestException(
        'Target type must be either request, offer or support',
      );
    }

    // Verify target exists if not support
    if (cleanType === 'support') {
      if (!targetId) {
        targetId = 'support';
      }
    } else if (cleanType === 'request') {
      const request = await this.reportRepository.manager.findOne(
        AccessoryRequest,
        {
          where: { id: targetId },
        },
      );
      if (!request) {
        throw new NotFoundException(`Request with ID ${targetId} not found`);
      }
    } else {
      const offer = await this.reportRepository.manager.findOne(Offer, {
        where: { id: targetId },
      });
      if (!offer) {
        throw new NotFoundException(`Offer with ID ${targetId} not found`);
      }
    }

    const report = this.reportRepository.create({
      reporter: reporterId ? ({ id: reporterId } as any) : null,
      targetType: cleanType,
      targetId,
      description,
    });

    return this.reportRepository.save(report);
  }

  async findAll(): Promise<any[]> {
    const reports = await this.reportRepository.find({
      order: { createdAt: 'DESC' },
    });

    const result: any[] = [];
    for (const report of reports) {
      let targetDetails: any = null;

      try {
        if (report.targetType === 'request') {
          const req = await this.reportRepository.manager.findOne(
            AccessoryRequest,
            {
              where: { id: report.targetId },
              relations: ['user'],
            },
          );
          if (req) {
            targetDetails = {
              id: req.id,
              category: req.category,
              vehicleBrand: req.vehicleBrand,
              vehicleModel: req.vehicleModel,
              description: req.description,
              user: req.user
                ? { fullName: req.user.fullName, email: req.user.email }
                : null,
            };
          }
        } else {
          const offer = await this.reportRepository.manager.findOne(Offer, {
            where: { id: report.targetId },
            relations: ['supplier'],
          });
          if (offer) {
            targetDetails = {
              id: offer.id,
              price: offer.price,
              condition: offer.condition,
              description: offer.description,
              user: offer.supplier
                ? {
                    fullName: offer.supplier.fullName,
                    email: offer.supplier.email,
                  }
                : null,
            };
          }
        }
      } catch (e) {
        // Target might have been deleted already
      }

      result.push({
        id: report.id,
        reporter: report.reporter
          ? {
              id: report.reporter.id,
              fullName: report.reporter.fullName,
              email: report.reporter.email,
              phoneNumber: report.reporter.phoneNumber,
            }
          : {
              id: 'guest',
              fullName: 'Guest / Visitor',
              email: 'Guest',
              phoneNumber: '',
            },
        targetType: report.targetType,
        targetId: report.targetId,
        description: report.description,
        createdAt: report.createdAt,
        targetDetails,
      });
    }

    return result;
  }

  async deleteReportedItem(reportId: string): Promise<void> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const { targetType, targetId } = report;

    // Delete the actual target cleanly if not support
    if (targetType === 'request') {
      const request = await this.reportRepository.manager.findOne(
        AccessoryRequest,
        { where: { id: targetId } },
      );
      if (request) {
        // Delete all associated notifications/matches
        await this.reportRepository.manager.delete(Notification, {
          requestId: targetId,
        });
        // Delete the request
        await this.reportRepository.manager.remove(AccessoryRequest, request);
      }
    } else if (targetType === 'offer') {
      const offer = await this.reportRepository.manager.findOne(Offer, {
        where: { id: targetId },
      });
      if (offer) {
        // Delete all associated notifications/matches
        await this.reportRepository.manager.delete(Notification, {
          offerId: targetId,
        });
        // Delete the offer
        await this.reportRepository.manager.remove(Offer, offer);
      }
    }

    // Delete any other reports pointing to the same targetId, or just this report if support ticket
    if (targetType === 'support') {
      await this.reportRepository.delete({ id: reportId });
    } else {
      await this.reportRepository.delete({ targetId });
    }
  }

  async dismissReport(reportId: string): Promise<void> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    await this.reportRepository.remove(report);
  }
}
