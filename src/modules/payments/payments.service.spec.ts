import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentTransaction, PaymentStatus } from './entities/payment-transaction.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let transactionRepoMock: any;
  let planRepoMock: any;
  let userRepoMock: any;
  let notificationsServiceMock: any;

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
      expect(mockUser.points).toBe(350);
      expect(notificationsServiceMock.sendSystemNotification).toHaveBeenCalled();
    });
  });
});
