import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentTransaction, PaymentStatus } from './entities/payment-transaction.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let transactionRepoMock: any;
  let planRepoMock: any;
  let userRepoMock: any;
  let notificationsServiceMock: any;
  let usersServiceMock: any;

  beforeEach(async () => {
    transactionRepoMock = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'tx-1', ...dto })),
      save: jest.fn().mockImplementation(async (entity) => entity),
      findOne: jest.fn(),
    };

    planRepoMock = {
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockResolvedValue([
        {
          id: 'plan-1',
          planId: 'pro',
          nameEn: 'Pro Plan',
          nameAr: 'الباقة الاحترافية',
          price: 19.99,
          points: 250,
          isActive: true,
        },
      ]),
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        if (where.planId === 'pro') {
          return {
            id: 'plan-1',
            planId: 'pro',
            nameEn: 'Pro Plan',
            nameAr: 'الباقة الاحترافية',
            price: 19.99,
            points: 250,
            isActive: true,
          };
        }
        return null;
      }),
      create: jest.fn().mockImplementation((dto) => ({ id: 'p-1', ...dto })),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    userRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (user) => user),
    };

    usersServiceMock = { addLedger: jest.fn(), award: jest.fn() };

    notificationsServiceMock = {
      sendSystemNotification: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentTransaction),
          useValue: transactionRepoMock,
        },
        {
          provide: getRepositoryToken(PaymentPlan),
          useValue: planRepoMock,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepoMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        { provide: UsersService, useValue: usersServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'PAY_NET_API_URL') return 'https://dev-merchant.pay.net.ly';
              if (key === 'PAY_NET_STORE_ID') return 'test_store_123';
              if (key === 'APP_BACKEND_URL') return 'https://test-back.app';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    it('should create pending transaction and return checkout payload for valid DB plan', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', phoneNumber: '+218912345678', language: 'ar' };
      userRepoMock.findOne.mockResolvedValue(mockUser);

      const result = await service.initiatePayment('u-1', 'pro');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(19.99);
      expect(result.points).toBe(250);
      expect(result.customRef).toMatch(/^PAY-/);
      expect(transactionRepoMock.save).toHaveBeenCalled();
    });

    it('should initiate Edfaly payment with custom test phone and test credentials', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', phoneNumber: '+218912345678', language: 'ar' };
      userRepoMock.findOne.mockResolvedValue(mockUser);

      const result = await service.initiatePayment('u-1', 'pro', '091-1234567', 'edfaly');

      expect(result.success).toBe(true);
      expect(result.paymentMethod).toBe('edfaly');
      expect(result.testCredentials.phone).toBe('091-1234567');
      expect(result.testCredentials.identityCard).toBe('666666');
      expect(result.testCredentials.otp).toBe('6666');
      expect(result.checkoutUrl).toContain('payments/edfaly/checkout');
    });

    it('should throw BadRequestException if plan is invalid', async () => {
      userRepoMock.findOne.mockResolvedValue({ id: 'u-1' });

      await expect(service.initiatePayment('u-1', 'invalid_plan')).rejects.toThrow();
    });
  });

  describe('handleWebhook', () => {
    it('should credit points and mark transaction COMPLETED when webhook result is success', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', points: 100 };
      const mockTx = {
        id: 'tx-1',
        customRef: 'PAY-12345-ABC',
        status: PaymentStatus.PENDING,
        amount: 19.99,
        pointsCredited: 250,
        user: mockUser,
      };

      transactionRepoMock.findOne.mockResolvedValue(mockTx);

      const webhookPayload = {
        custom_ref: 'PAY-12345-ABC',
        result: 'success',
        payment_method: 'tadawul',
        our_ref: 'GW-999',
      };

      const result = await service.handleWebhook(webhookPayload);

      expect(result.status).toBe('processed');
      expect(mockTx.status).toBe(PaymentStatus.COMPLETED);
      expect(usersServiceMock.addLedger).toHaveBeenCalledWith('u-1', 250, 'purchase', { ref: 'PAY-12345-ABC' });
      expect(usersServiceMock.award).toHaveBeenCalledWith('u-1', 'paid', { ref: 'PAY-12345-ABC' });
      expect(notificationsServiceMock.sendSystemNotification).toHaveBeenCalled();
    });

    it('should leave the transaction PENDING when Pay.net does not confirm it', async () => {
      (service as any).configService.get = (key: string) =>
        key === 'PAY_NET_BEARER_TOKEN' ? 'secret' : null;
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ result: 'failed' }) } as any);
      const mockTx = { customRef: 'PAY-FAKE', status: PaymentStatus.PENDING, pointsCredited: 999, user: { id: 'u-1' } };
      transactionRepoMock.findOne.mockResolvedValue(mockTx);

      const result = await service.handleWebhook({ custom_ref: 'PAY-FAKE', result: 'success' });

      expect(result.status).toBe('unverified');
      expect(mockTx.status).toBe(PaymentStatus.PENDING);
      expect(usersServiceMock.addLedger).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should complete Edfaly transaction with test credentials', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', points: 100 };
      const mockTx = {
        id: 'tx-2',
        customRef: 'PAY-EDFALY-001',
        status: PaymentStatus.PENDING,
        amount: 25.0,
        pointsCredited: 50,
        planId: 'basic',
        user: mockUser,
      };

      transactionRepoMock.findOne.mockResolvedValue(mockTx);

      const result = await service.verifyTransaction('PAY-EDFALY-001', 'u-1', {
        otp: '6666',
        identityCard: '666666',
        phone: '091-1234567',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(mockTx.status).toBe(PaymentStatus.COMPLETED);
      expect(mockTx.paymentMethod).toBe('edfaly');
      expect(usersServiceMock.addLedger).toHaveBeenCalledWith('u-1', 50, 'purchase', { ref: 'PAY-EDFALY-001' });
    });

    it('should render hosted Edfaly checkout HTML with test credentials and order amount', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', phoneNumber: '091-1234567' };
      const mockTx = {
        id: 'tx-3',
        customRef: 'PAY-EDFALY-HTML',
        status: PaymentStatus.PENDING,
        amount: 50.0,
        pointsCredited: 120,
        planId: 'pro',
        user: mockUser,
      };

      transactionRepoMock.findOne.mockResolvedValue(mockTx);

      const html = await service.renderEdfalyHostedPage('PAY-EDFALY-HTML');

      expect(html).toContain('إدفع لي');
      expect(html).toContain('091-1234567');
      expect(html).toContain('666666');
      expect(html).toContain('6666');
      expect(html).toContain('50.00');
      expect(html).toContain('PAY-EDFALY-HTML');
    });

    it('should process hosted Edfaly form with test card and complete transaction', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', points: 0 };
      const mockTx = {
        id: 'tx-4',
        customRef: 'PAY-EDFALY-FORM',
        status: PaymentStatus.PENDING,
        amount: 100.0,
        pointsCredited: 300,
        planId: 'elite',
        user: mockUser,
      };

      transactionRepoMock.findOne.mockResolvedValue(mockTx);

      const responseHtml = await service.processEdfalyForm({
        customRef: 'PAY-EDFALY-FORM',
        phone: '091-1234567',
        identityCard: '666666',
        otp: '6666',
      });

      expect(responseHtml).toContain('تم الدفع بنجاح');
      expect(responseHtml).toContain('spurgo://payment-result');
      expect(mockTx.status).toBe(PaymentStatus.COMPLETED);
      expect(mockTx.paymentMethod).toBe('edfaly');
      expect(usersServiceMock.addLedger).toHaveBeenCalledWith('u-1', 300, 'purchase', { ref: 'PAY-EDFALY-FORM' });
    });

    it('should be idempotent and not double-credit if verified twice', async () => {
      const mockUser = { id: 'u-1', email: 'user@spurgo.com', points: 300 };
      const mockTx = {
        id: 'tx-5',
        customRef: 'PAY-EDFALY-DUP',
        status: PaymentStatus.COMPLETED,
        amount: 25.0,
        pointsCredited: 50,
        planId: 'basic',
        user: mockUser,
      };

      transactionRepoMock.findOne.mockResolvedValue(mockTx);
      usersServiceMock.addLedger.mockClear();

      const result = await service.verifyTransaction('PAY-EDFALY-DUP', 'u-1');

      expect(result.success).toBe(true);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(usersServiceMock.addLedger).not.toHaveBeenCalled();
    });
  });
});
