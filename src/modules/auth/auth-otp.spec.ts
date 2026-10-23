import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { EmailVerification } from '../users/entities/email-verification.entity';
import { SystemConfig } from '../users/entities/system-config.entity';
import { AdminNotification } from '../users/entities/admin-notification.entity';
import { JwtService } from '@nestjs/jwt';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';
import { BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService - OTP Email Verification', () => {
  let authService: AuthService;
  let userRepo: any;
  let verificationRepo: any;
  let mailService: any;
  let smsService: any;

  const mockUser: Partial<User> = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashed-password',
    role: UserRole.CUSTOMER,
    isEmailVerified: false,
    points: 100,
  };

  const mockVerification: Partial<EmailVerification> = {
    id: 'verify-123',
    email: 'test@example.com',
    code: '123456',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins in future
    createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    lastSentAt: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    attempts: 0,
    registrationData: JSON.stringify({
      email: 'test@example.com',
      password: 'hashed-password',
      fullName: 'Test User',
      role: UserRole.CUSTOMER,
      points: 100,
    }),
  };

  beforeEach(async () => {
    const mockUserRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    const mockVerificationRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockAdminNotificationRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    const mockMailService = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    const mockSmsService = {
      sendSms: jest.fn().mockResolvedValue(undefined),
      sendOtp: jest.fn().mockResolvedValue(undefined),
    };

    const mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(EmailVerification), useValue: mockVerificationRepo },
        { provide: getRepositoryToken(SystemConfig), useValue: { findOne: jest.fn().mockResolvedValue({ value: '100' }) } },
        { provide: getRepositoryToken(AdminNotification), useValue: mockAdminNotificationRepo },
        { provide: MailService, useValue: mockMailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepo = mockUserRepo;
    verificationRepo = mockVerificationRepo;
    mailService = mockMailService;
    smsService = mockSmsService;
  });

  describe('login()', () => {
    it('should throw UnauthorizedException if email is not verified', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, isEmailVerified: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.login({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(new UnauthorizedException('EMAIL_NOT_VERIFIED'));
    });

    it('should login successfully if email is verified', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, isEmailVerified: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('verifyOtp()', () => {
    it('should throw error if verification code is not found', async () => {
      verificationRepo.findOne.mockResolvedValue(null);

      await expect(
        authService.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(new BadRequestException('Invalid verification code'));
    });

    it('should throw error if code has expired', async () => {
      const expiredVerification = {
        ...mockVerification,
        expiresAt: new Date(Date.now() - 5000), // expired 5s ago
      };
      verificationRepo.findOne.mockResolvedValue(expiredVerification);

      await expect(
        authService.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(new BadRequestException('Verification code has expired'));
    });

    it('should successfully verify email and delete OTP entry', async () => {
      verificationRepo.findOne.mockResolvedValue({ ...mockVerification });
      userRepo.findOne.mockResolvedValue(null);
      userRepo.save.mockResolvedValue({ ...mockUser, isEmailVerified: true });
      verificationRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await authService.verifyOtp('test@example.com', '123456');

      expect(result.message).toBe('Email verified successfully');
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isEmailVerified: true }),
      );
      expect(verificationRepo.delete).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('should increment attempts and throw error if code is invalid', async () => {
      const dbVerification = { ...mockVerification, code: '123456', attempts: 0 } as EmailVerification;
      verificationRepo.findOne.mockResolvedValue(dbVerification);

      await expect(
        authService.verifyOtp('test@example.com', 'wrongcode'),
      ).rejects.toThrow(new BadRequestException('Invalid verification code. 4 attempts remaining.'));

      expect(verificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 1 }),
      );
    });

    it('should delete verification and block after 5 failed attempts', async () => {
      const dbVerification = { ...mockVerification, code: '123456', attempts: 4 } as EmailVerification;
      verificationRepo.findOne.mockResolvedValue(dbVerification);

      await expect(
        authService.verifyOtp('test@example.com', 'wrongcode'),
      ).rejects.toThrow(
        new BadRequestException('Too many failed attempts. This verification code has been invalidated. Please request a new one.'),
      );

      expect(verificationRepo.delete).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('should throw ConflictException if phone number is already registered by a verified user', async () => {
      verificationRepo.findOne.mockResolvedValue({
        ...mockVerification,
        registrationData: JSON.stringify({
          email: 'test@example.com',
          password: 'hashed-password',
          fullName: 'Test User',
          role: UserRole.CUSTOMER,
          points: 100,
          phoneNumber: '+21612345678',
        }),
      });
      
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-id', phoneNumber: '+21612345678' });

      await expect(
        authService.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(new ConflictException('User with this phone number already exists'));
    });
  });

  describe('resendOtp()', () => {
    it('should throw error if pending verification does not exist', async () => {
      verificationRepo.findOne.mockResolvedValue(null);

      await expect(authService.resendOtp('nonexistent@example.com')).rejects.toThrow(
        new BadRequestException('No active verification process found for this email'),
      );
    });

    it('should update existing OTP and send a new one', async () => {
      verificationRepo.findOne.mockResolvedValue({ ...mockVerification });
      verificationRepo.save.mockResolvedValue({ ...mockVerification });

      const result = await authService.resendOtp('test@example.com');

      expect(result).toEqual({ message: 'Verification code resent' });
      expect(verificationRepo.save).toHaveBeenCalled();
      expect(mailService.sendOtp).toHaveBeenCalled();
    });

    it('should throw error if called within 60 seconds (cooldown)', async () => {
      const recentlySentVerification = {
        ...mockVerification,
        lastSentAt: new Date(Date.now() - 30 * 1000), // 30s ago
      };
      verificationRepo.findOne.mockResolvedValue(recentlySentVerification);

      await expect(authService.resendOtp('test@example.com')).rejects.toThrow(
        /Please wait \d+ seconds before requesting a new code./,
      );
    });
  });

  describe('forgotPassword()', () => {
    it('should throw error if user does not exist or is not verified', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(authService.forgotPassword('nonexistent@example.com')).rejects.toThrow(
        new BadRequestException('User with this account does not exist'),
      );
    });

    it('should save password reset code and send reset email', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, isEmailVerified: true });
      verificationRepo.findOne.mockResolvedValue(null); // no cooldown
      verificationRepo.create.mockReturnValue({ ...mockVerification, purpose: 'password_reset' });
      verificationRepo.save.mockResolvedValue({ ...mockVerification, purpose: 'password_reset' });

      const result = await authService.forgotPassword('test@example.com');

      expect(result).toEqual({ message: 'Password reset code sent successfully' });
      expect(verificationRepo.save).toHaveBeenCalled();
      expect(mailService.sendPasswordReset).toHaveBeenCalled();
    });
  });

  describe('verifyResetOtp()', () => {
    it('should verify reset OTP and return a JWT reset token', async () => {
      const resetVerification = {
        ...mockVerification,
        purpose: 'password_reset',
        code: '654321',
      };
      verificationRepo.findOne.mockResolvedValue(resetVerification);
      verificationRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await authService.verifyResetOtp('test@example.com', '654321');

      expect(result).toHaveProperty('resetToken', 'mock-jwt-token');
      expect(verificationRepo.delete).toHaveBeenCalledWith({ email: 'test@example.com', purpose: 'password_reset' });
    });
  });

  describe('resetPassword()', () => {
    it('should throw error if passwords do not match', async () => {
      await expect(
        authService.resetPassword({
          resetToken: 'some-token',
          newPassword: 'password123',
          confirmPassword: 'password456',
        }),
      ).rejects.toThrow(new BadRequestException('Passwords do not match'));
    });
  });

  describe('register()', () => {
    it('should throw ConflictException if user with the same email already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'existing-id', email: 'test@example.com' });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(new ConflictException('User with this email already exists'));
    });

    it('should throw ConflictException if user with the same phone number already exists', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-id', phoneNumber: '+21612345678' });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
          phoneNumber: '+21612345678',
        }),
      ).rejects.toThrow(new ConflictException('User with this phone number already exists'));
    });

    it('should successfully create verification record and send OTP if email and phone are unique', async () => {
      userRepo.findOne.mockResolvedValue(null);
      verificationRepo.create.mockReturnValue({ ...mockVerification });
      verificationRepo.save.mockResolvedValue({ ...mockVerification });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        phoneNumber: '+21612345678',
      });

      expect(result).toEqual({
        message: 'Verification code sent successfully',
        email: 'test@example.com',
      });
      expect(verificationRepo.save).toHaveBeenCalled();
      expect(mailService.sendOtp).toHaveBeenCalled();
    });
  });
});
