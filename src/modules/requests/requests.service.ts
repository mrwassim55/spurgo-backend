import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { AccessoryRequest, RequestStatus } from './entities/accessory-request.entity';
import { RequestTarget, TargetStatus } from './entities/request-target.entity';
import { RequestLog } from './entities/request-log.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { Offer } from '../offers/entities/offer.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NUDGE_MESSAGE, shouldNudge } from '../users/rules';

const STORE_FIELDS = (u?: User | null) =>
  u
    ? {
        id: u.id,
        fullName: u.fullName,
        companyName: u.companyName,
        phoneNumber: u.phoneNumber,
        whatsapp: u.whatsapp,
        city: u.city,
        region: u.region,
      }
    : null;

export const requestRef = (id: string) => id.slice(0, 8).toUpperCase();

@Injectable()
export class RequestsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestsService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @InjectRepository(AccessoryRequest)
    private requestsRepository: Repository<AccessoryRequest>,
    @InjectRepository(RequestTarget)
    private targetsRepository: Repository<RequestTarget>,
    @InjectRepository(RequestLog)
    private logsRepository: Repository<RequestLog>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Offer)
    private offersRepository: Repository<Offer>,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    // ponytail: single-instance timer; move to @nestjs/schedule + a DB lock if the API runs >1 replica.
    this.timer = setInterval(() => void this.nudgeTick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(createRequestDto: CreateRequestDto, user: User): Promise<AccessoryRequest> {
    // Never let the body set server-owned fields.
    const { id, status, user: _u, offersDeadline, createdAt, updatedAt, ...data } =
      createRequestDto as any;

    // Prevent double-submission of requests (idempotency guard)
    const existingDuplicate = await this.requestsRepository.findOne({
      where: {
        user: { id: user.id },
        vehicleBrand: data.vehicleBrand,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        description: data.description,
      },
      order: { createdAt: 'DESC' },
    });

    if (existingDuplicate) {
      const tenSecondsAgo = Date.now() - 10000;
      if (existingDuplicate.createdAt.getTime() > tenSecondsAgo) {
        return existingDuplicate;
      }
    }

    const settings = await this.usersService.getSettings();
    const request = await this.requestsRepository.save(
      this.requestsRepository.create({
        ...data,
        quantity: Number(data.quantity) > 0 ? Number(data.quantity) : 1,
        offersDeadline: new Date(Date.now() + settings.responseWindowMinutes * 60_000),
        user: { id: user.id } as User,
      }) as unknown as AccessoryRequest,
    );

    try {
      await this.broadcast(request, settings.maxTargetStores);
    } catch (e) {
      this.logger.error(`Broadcast failed for request ${request.id}`, e as Error);
    }
    return request;
  }

  // Send the request to every matching store AND the agents at the same moment (client doc §4, §6).
  private async broadcast(request: AccessoryRequest, maxTargets: number) {
    const suppliers = await this.usersRepository.find({
      where: { role: UserRole.SUPPLIER, isApproved: true, isActive: true },
    });
    let targets = pickStores(suppliers, request);
    if (maxTargets > 0) targets = targets.slice(0, maxTargets);

    await this.targetsRepository.save(
      targets.map((s) => this.targetsRepository.create({ request: { id: request.id }, supplier: { id: s.id } })),
    );

    const summary = `${request.vehicleBrand} ${request.vehicleModel} ${request.vehicleYear} — ${request.category}`;
    const data = { requestId: request.id };
    for (const s of targets) {
      await this.notificationsService.sendSystemNotification(s.id, 'طلب قطعة جديد', summary, 'new_request', data);
    }
    const agents = await this.usersRepository.find({ where: { role: UserRole.STAFF, isActive: true } });
    for (const a of agents) {
      await this.notificationsService.sendSystemNotification(
        a.id,
        'طلب جديد للمتابعة',
        `#${requestRef(request.id)} ${summary}`,
        'agent_new_request',
        data,
      );
    }
  }

  async nudgeTick(now = new Date()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let sent = 0;
    try {
      const settings = await this.usersService.getSettings();
      const pending = await this.targetsRepository.find({
        where: {
          status: TargetStatus.PENDING,
          request: { status: RequestStatus.PENDING, offersDeadline: MoreThan(now) },
        },
        relations: ['request', 'supplier'],
      });
      if (!pending.length) return 0;

      const offered = await this.targetsRepository.find({
        where: {
          status: TargetStatus.OFFERED,
          request: { id: In([...new Set(pending.map((t) => t.request.id))]) },
        },
        relations: ['request'],
      });
      const answered = new Set(offered.map((t) => t.request.id));

      for (const t of pending) {
        const ok = shouldNudge(
          t,
          { status: t.request.status, offersDeadline: t.request.offersDeadline, hasOffer: answered.has(t.request.id) },
          settings,
          now,
        );
        if (!ok) continue;
        t.nudges += 1;
        t.lastNudgedAt = now;
        await this.targetsRepository.save(t);
        await this.notificationsService.sendSystemNotification(
          t.supplier.id,
          'تذكير بالطلب',
          NUDGE_MESSAGE,
          'request_nudge',
          { requestId: t.request.id },
        );
        sent++;
      }
    } catch (e) {
      this.logger.error('Nudge tick failed', e as Error);
    } finally {
      this.ticking = false;
    }
    return sent;
  }

  // Store side ---------------------------------------------------------------

  async findTargeted(supplierId: string) {
    const targets = await this.targetsRepository.find({
      where: { supplier: { id: supplierId } },
      relations: ['request'],
      order: { createdAt: 'DESC' },
    });
    return targets.map((t) => ({
      ...t.request,
      ref: requestRef(t.request.id),
      targetStatus: t.status,
      respondedAt: t.respondedAt,
    }));
  }

  async respond(requestId: string, supplierId: string, action: string) {
    const status = { decline: TargetStatus.DECLINED, unavailable: TargetStatus.UNAVAILABLE }[action];
    if (!status) throw new BadRequestException('action must be decline or unavailable');

    const target = await this.targetsRepository.findOne({
      where: { request: { id: requestId }, supplier: { id: supplierId } },
    });
    if (!target) throw new NotFoundException('This request was not sent to your store');
    if (target.status === TargetStatus.OFFERED) {
      throw new BadRequestException('You already sent an offer for this request');
    }
    target.status = status;
    target.respondedAt = new Date();
    await this.targetsRepository.save(target);
    await this.usersService.award(supplierId, 'decline', { requestId });
    return target;
  }

  // Called when a store (or an agent on its behalf) sends an offer.
  async markOffered(requestId: string, supplierId: string) {
    let target = await this.targetsRepository.findOne({
      where: { request: { id: requestId }, supplier: { id: supplierId } },
    });
    target ??= this.targetsRepository.create({ request: { id: requestId }, supplier: { id: supplierId } });
    target.status = TargetStatus.OFFERED;
    target.respondedAt = new Date();
    await this.targetsRepository.save(target);
    await this.usersService.award(supplierId, 'offer', { requestId });
    // Trigger immediate incentive nudge to other pending stores (client doc §5)
    void this.nudgeTick();
  }

  // Agent / admin side -------------------------------------------------------

  async findForAgent(all = false) {
    const requests = await this.requestsRepository.find({
      where: all ? {} : { status: In([RequestStatus.PENDING, RequestStatus.MATCHED]) },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    if (!requests.length) return [];
    const ids = requests.map((r) => r.id);
    const [targets, offers, logs] = await Promise.all([
      this.targetsRepository.find({ where: { request: { id: In(ids) } }, relations: ['request', 'supplier'] }),
      this.offersRepository.find({ where: { request: { id: In(ids) } }, relations: ['request', 'supplier'] }),
      this.logsRepository.find({
        where: { request: { id: In(ids) } },
        relations: ['request', 'author'],
        order: { createdAt: 'ASC' },
      }),
    ]);
    return requests.map((r) => ({
      ...r,
      ref: requestRef(r.id),
      user: r.user
        ? { id: r.user.id, fullName: r.user.fullName, phoneNumber: r.user.phoneNumber, whatsapp: r.user.whatsapp }
        : null,
      targets: targets
        .filter((t) => t.request.id === r.id)
        .map((t) => ({
          id: t.id,
          status: t.status,
          nudges: t.nudges,
          respondedAt: t.respondedAt,
          supplier: STORE_FIELDS(t.supplier),
        })),
      offers: offers
        .filter((o) => o.request.id === r.id)
        .map(({ request: _r, supplier, ...o }) => ({ ...o, supplier: STORE_FIELDS(supplier) })),
      logs: logs
        .filter((l) => l.request.id === r.id)
        .map((l) => ({
          id: l.id,
          type: l.type,
          note: l.note,
          createdAt: l.createdAt,
          author: l.author ? { id: l.author.id, fullName: l.author.fullName } : null,
        })),
    }));
  }

  async addTarget(requestId: string, supplierId: string, author: { id: string }) {
    const request = await this.requestsRepository.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    const supplier = await this.usersRepository.findOne({ where: { id: supplierId, role: UserRole.SUPPLIER } });
    if (!supplier) throw new BadRequestException('supplierId is not a store');

    const exists = await this.targetsRepository.findOne({
      where: { request: { id: requestId }, supplier: { id: supplierId } },
    });
    if (exists) return exists;
    const target = await this.targetsRepository.save(
      this.targetsRepository.create({ request: { id: requestId }, supplier: { id: supplierId } }),
    );
    await this.addLog(requestId, author, 'system', `تمت إضافة المتجر ${supplier.companyName || supplier.fullName} للطلب`);
    await this.notificationsService.sendSystemNotification(
      supplierId,
      'طلب قطعة جديد',
      `${request.vehicleBrand} ${request.vehicleModel} ${request.vehicleYear} — ${request.category}`,
      'new_request',
      { requestId },
    );
    return target;
  }

  async addLog(requestId: string, author: { id: string }, type: string, note: string) {
    if (!['store_contact', 'customer_contact', 'update', 'system'].includes(type)) {
      throw new BadRequestException('type must be store_contact, customer_contact or update');
    }
    if (!note?.trim()) throw new BadRequestException('note is required');
    const request = await this.requestsRepository.findOne({ where: { id: requestId }, relations: ['user'] });
    if (!request) throw new NotFoundException('Request not found');

    const log = await this.logsRepository.save(
      this.logsRepository.create({ request: { id: requestId }, author: { id: author.id }, type, note: note.trim() }),
    );
    // "update" is the agent telling the customer about progress (client doc §6.4).
    if (type === 'update' && request.user) {
      await this.notificationsService.sendSystemNotification(
        request.user.id,
        `تحديث على طلبك #${requestRef(requestId)}`,
        note.trim(),
        'request_update',
        { requestId },
      );
    }
    return log;
  }

  async cancel(requestId: string, author: { id: string }) {
    const request = await this.requestsRepository.findOne({ where: { id: requestId }, relations: ['user'] });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== RequestStatus.PENDING) return request;
    request.status = RequestStatus.CANCELLED; // stops offers and store nudges
    await this.requestsRepository.save(request);
    await this.addLog(requestId, author, 'system', 'تم إغلاق الطلب من الإدارة');
    return request;
  }

  // Existing endpoints -------------------------------------------------------

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
      throw new ForbiddenException('You are not authorized to delete this request');
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

// ponytail: naive stem match of store specializations against brand/country ("Japanese" ~ "Japan (Asian)").
// Upgrade to region/category scoring if targeting turns out too broad. Falls back to all stores so a
// request is never sent to nobody; same-city stores come first.
export function pickStores(
  suppliers: User[],
  request: Pick<AccessoryRequest, 'vehicleBrand' | 'manufactureCountry' | 'city'>,
): User[] {
  const hay = `${request.vehicleBrand ?? ''} ${request.manufactureCountry ?? ''}`.toLowerCase();
  const matches = suppliers.filter((s) => {
    const stems = (s.specializations ?? '')
      .split(/[,،;/]/)
      .map((x) => x.trim().toLowerCase().slice(0, 5))
      .filter((x) => x.length >= 3);
    return stems.length === 0 || stems.some((stem) => hay.includes(stem));
  });
  const list = matches.length ? matches : suppliers;
  return [...list].sort((a, b) => Number(b.city === request.city) - Number(a.city === request.city));
}
