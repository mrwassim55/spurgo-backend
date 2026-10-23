import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from '../src/modules/users/users.service';
import { User, UserRole } from '../src/modules/users/entities/user.entity';
import { SystemConfig } from '../src/modules/users/entities/system-config.entity';
import { AdminNotification } from '../src/modules/users/entities/admin-notification.entity';
import { DEFAULT_SIGNUP_POINTS } from '../src/modules/users/points.config';
import { EntityManager } from 'typeorm';

describe('UsersService - Free Plan Points Configuration Update', () => {
  let service: UsersService;

  const oldConfigPoints = 50;
  const newConfigPoints = 80;
  const spentPoints = 75;

  const mockUsers: Partial<User>[] = [
    {
      id: 'user1',
      email: 'user1@example.com',
      points: oldConfigPoints,
      role: UserRole.CUSTOMER,
    },
    {
      id: 'user2',
      email: 'user2@example.com',
      points: spentPoints,
      role: UserRole.CUSTOMER,
    },
    {
      id: 'user3',
      email: 'user3@example.com',
      points: DEFAULT_SIGNUP_POINTS,
      role: UserRole.SUPPLIER,
    },
    {
      id: 'admin1',
      email: 'admin1@example.com',
      points: DEFAULT_SIGNUP_POINTS,
      role: UserRole.ADMIN,
    },
  ];

  const mockSystemConfigs: Record<string, string> = {
    signupPoints: oldConfigPoints.toString(),
    consumptionRate: '25',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockImplementation((options: { where: any }) => {
              const conditions = Array.isArray(options.where)
                ? options.where
                : [options.where];
              return Promise.resolve(
                mockUsers.filter((u) => {
                  return conditions.some(
                    (cond: { points?: number }) => u.points === cond.points,
                  );
                }),
              );
            }),
            save: jest.fn().mockImplementation((user: Partial<User>) => {
              const idx = mockUsers.findIndex((u) => u.id === user.id);
              if (idx !== -1) {
                mockUsers[idx] = { ...mockUsers[idx], ...user };
              }
              return Promise.resolve(user);
            }),
          },
        },
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: {
            findOne: jest
              .fn()
              .mockImplementation((options: { where: { key: string } }) => {
                const value = mockSystemConfigs[options.where.key];
                if (!value) return Promise.resolve(null);
                return Promise.resolve({ key: options.where.key, value });
              }),
            save: jest
              .fn()
              .mockImplementation((config: { key: string; value: string }) => {
                mockSystemConfigs[config.key] = config.value;
                return Promise.resolve(config);
              }),
          },
        },
        {
          provide: getRepositoryToken(AdminNotification),
          useValue: {},
        },
        {
          provide: EntityManager,
          useValue: {
            createQueryBuilder: jest.fn().mockImplementation(() => {
              let queriedUserId = '';
              const builder = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest
                  .fn()
                  .mockImplementation(
                    (
                      clause: string,
                      params?: Record<string, string | undefined>,
                    ) => {
                      if (params && (params.userId || params.supplierId)) {
                        queriedUserId =
                          params.userId || params.supplierId || '';
                      }
                      return builder;
                    },
                  ),
                getCount: jest.fn().mockImplementation(() => {
                  // user2 has spent points (requestCount / offerCount > 0)
                  if (queriedUserId === 'user2') {
                    return Promise.resolve(1);
                  }
                  return Promise.resolve(0);
                }),
              };
              return builder;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    // Reset config mocks to initial values (old signupPoints config is oldConfigPoints)
    mockSystemConfigs.signupPoints = oldConfigPoints.toString();
    mockSystemConfigs.consumptionRate = '25';

    // Reset user points to original mock state
    mockUsers[0].points = oldConfigPoints;
    mockUsers[1].points = spentPoints;
    mockUsers[2].points = DEFAULT_SIGNUP_POINTS;
    mockUsers[3].points = DEFAULT_SIGNUP_POINTS;
  });

  it('should update user points if they have oldSignupPoints OR default signupPoints and are not admins', async () => {
    // Admin decides to change Free Plan signupPoints to newConfigPoints
    const result = (await service.updatePointsConfig(newConfigPoints, 25)) as {
      signupPoints: number;
    };

    // Verify config saved
    expect(result.signupPoints).toBe(newConfigPoints);
    expect(mockSystemConfigs.signupPoints).toBe(newConfigPoints.toString());

    // Verify user1 (CUSTOMER, had oldConfigPoints) was updated to newConfigPoints
    expect(mockUsers[0].points).toBe(newConfigPoints);

    // Verify user2 (CUSTOMER, had spentPoints) was NOT updated (remains spentPoints)
    expect(mockUsers[1].points).toBe(spentPoints);

    // Verify user3 (SUPPLIER, had DEFAULT_SIGNUP_POINTS) was updated to newConfigPoints
    expect(mockUsers[2].points).toBe(newConfigPoints);

    // Verify admin1 (ADMIN, had DEFAULT_SIGNUP_POINTS) was NOT updated (Admin points are preserved)
    expect(mockUsers[3].points).toBe(DEFAULT_SIGNUP_POINTS);
  });
});
