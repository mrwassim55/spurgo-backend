import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  OnApplicationBootstrap,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { SystemConfig } from '../users/entities/system-config.entity';
import { AdminNotification } from '../users/entities/admin-notification.entity';
import { EmailVerification } from '../users/entities/email-verification.entity';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(SystemConfig)
    private configRepository: Repository<SystemConfig>,
    @InjectRepository(AdminNotification)
    private adminNotificationsRepository: Repository<AdminNotification>,
    @InjectRepository(EmailVerification)
    private emailVerificationRepository: Repository<EmailVerification>,
    private jwtService: JwtService,
    private mailService: MailService,
    private smsService: SmsService,
  ) {}

  async onApplicationBootstrap() {
    const adminEmail = 'adminmaxmode@spurgo.spurgo';
    const adminPassword = '123456789dwvlspurgoer';

    try {
      const existingAdmin = await this.usersRepository.findOne({
        where: { email: adminEmail },
      });
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const admin = this.usersRepository.create({
          email: adminEmail,
          password: hashedPassword,
          fullName: 'Admin Max Mode',
          role: UserRole.ADMIN,
          points: 999999,
          isEmailVerified: true,
        });
        await this.usersRepository.save(admin);
        console.log(
          'Successfully seeded admin user adminmaxmode@spurgo.spurgo',
        );
      }
    } catch (error) {
      console.error('Error seeding admin user:', error);
    }
  }

  async register(
    registrationData: any,
  ): Promise<{ message: string; email: string }> {
    const { email, password, fullName, role, ...extra } = registrationData;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    // Check if user exists (only verified users exist in this table now)
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if phone number is already registered by a verified user
    const phoneNumber = registrationData.phoneNumber
      ? registrationData.phoneNumber.trim()
      : registrationData.phone
      ? registrationData.phone.trim()
      : '';
    if (phoneNumber) {
      const existingUserByPhone = await this.usersRepository.findOne({
        where: { phoneNumber },
      });
      if (existingUserByPhone) {
        throw new ConflictException('User with this phone number already exists');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Load signup points config
    const signupPointsEntry = await this.configRepository.findOne({
      where: { key: 'signupPoints' },
    });
    const signupPoints = parseInt(signupPointsEntry?.value || '100', 10);

    // Prepare user creation payload (we store it instead of writing to users table)
    const pendingUserPayload = {
      email: normalizedEmail,
      password: hashedPassword,
      fullName,
      phoneNumber,
      role: role || UserRole.CUSTOMER,
      points: signupPoints,
      ...extra,
    };

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Delete any existing code for this email to prevent unique constraint conflict
    await this.emailVerificationRepository.delete({ email: normalizedEmail });

    // Save OTP and pending registration payload
    const verification = this.emailVerificationRepository.create({
      email: normalizedEmail,
      code,
      expiresAt,
      lastSentAt: new Date(),
      registrationData: JSON.stringify(pendingUserPayload),
    });
    await this.emailVerificationRepository.save(verification);

    // Send SMS OTP asynchronously (non-blocking so signup responds instantly)
    if (phoneNumber) {
      this.smsService.sendOtp(phoneNumber, code).catch((e) => {
        console.error('Failed to send SMS OTP during registration:', e);
      });
    }

    // Send Email OTP asynchronously (will cleanly skip if ENABLE_EMAIL_OTP=false)
    this.mailService.sendOtp(normalizedEmail, code).catch((e) => {
      console.error('Failed to send verification email during registration:', e);
    });

    return {
      message: 'Verification code sent successfully',
      email: normalizedEmail,
    };
  }

  async login(loginData: any): Promise<{ accessToken: string; user: any }> {
    const { password } = loginData;
    const rawInput = (
      loginData.email ||
      loginData.identifier ||
      loginData.phone ||
      loginData.phoneNumber ||
      ''
    ).trim();
    const normalizedInput = rawInput.toLowerCase();

    this.logger.log(`[LOGIN_ATTEMPT] identifier="${normalizedInput}"`);

    const user = await this.usersRepository.findOne({
      where: [
        { email: normalizedInput },
        { phoneNumber: rawInput },
        { phoneNumber: normalizedInput },
      ],
    });
    if (!user) {
      this.logger.warn(`[LOGIN_FAILED] No user found with identifier="${normalizedInput}"`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isActive === false) {
      this.logger.warn(`[LOGIN_FAILED] User isActive is false for identifier="${normalizedInput}"`);
      throw new UnauthorizedException(
        'Your access has been revoked. Please contact support.',
      );
    }

    if (user.isEmailVerified === false) {
      this.logger.warn(`[LOGIN_FAILED] User isEmailVerified is false for identifier="${normalizedInput}"`);
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`[LOGIN_FAILED] Password compare failed for identifier="${normalizedInput}"`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role === UserRole.SUPPLIER && (user.isApproved === false || user.verificationStatus !== 'approved')) {
      if (user.verificationStatus === 'rejected') {
        throw new UnauthorizedException('SUPPLIER_REJECTED');
      }
      const hasDocs = user.verificationDocuments && user.verificationDocuments.length > 0;
      if (hasDocs) {
        throw new UnauthorizedException('SUPPLIER_PENDING_APPROVAL');
      }
    }

    const payload = { sub: user.id, email: user.email, role: user.role };

    // Remove password from user object before returning
    const { password: _, ...userWithoutPassword } = user;

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: userWithoutPassword,
    };
  }

  async findUserById(id: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) return null;
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async verifyOtp(email: string, code: string): Promise<{ message: string; user?: any; accessToken?: string }> {
    const normalizedEmail = email ? String(email).toLowerCase().trim() : '';
    const cleanCode = code !== undefined && code !== null ? String(code).trim() : '';
    const verification = await this.emailVerificationRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification code');
    }

    if (new Date() > verification.expiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    const storedCode = verification.code !== undefined && verification.code !== null ? String(verification.code).trim() : '';
    if (storedCode !== cleanCode) {
      verification.attempts += 1;
      if (verification.attempts >= 5) {
        await this.emailVerificationRepository.delete({ email: normalizedEmail });
        throw new BadRequestException(
          'Too many failed attempts. This verification code has been invalidated. Please request a new one.',
        );
      } else {
        await this.emailVerificationRepository.save(verification);
        const remaining = 5 - verification.attempts;
        throw new BadRequestException(
          `Invalid verification code. ${remaining} attempts remaining.`,
        );
      }
    }

    // Code matches!
    if (!verification.registrationData) {
      throw new BadRequestException('Verification configuration error. No registration data found.');
    }

    const payload = JSON.parse(verification.registrationData);

    // Double check that user hasn't registered/verified in the meantime
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Double check that phone number hasn't been registered in the meantime
    const phoneNumber = payload.phoneNumber ? payload.phoneNumber.trim() : '';
    if (phoneNumber) {
      const existingUserByPhone = await this.usersRepository.findOne({
        where: { phoneNumber },
      });
      if (existingUserByPhone) {
        throw new ConflictException('User with this phone number already exists');
      }
    }

    // Promote pending registration to a verified user!
    const isSupplier = payload.role === UserRole.SUPPLIER || payload.role === 'supplier';
    const user = this.usersRepository.create({
      ...payload,
      isEmailVerified: true,
      isApproved: !isSupplier,
      verificationStatus: isSupplier ? 'pending' : 'approved',
      verificationDocuments: [],
    }) as unknown as User;
    const savedUser = await this.usersRepository.save(user);

    // Clean up verification record
    await this.emailVerificationRepository.delete({ email: normalizedEmail });

    const jwtPayload = { sub: savedUser.id, email: savedUser.email, role: savedUser.role };
    const accessToken = await this.jwtService.signAsync(jwtPayload);
    const { password: _, ...userWithoutPassword } = savedUser;

    // Send admin notification here, since they have officially verified and joined!
    try {
      const adminNotif = this.adminNotificationsRepository.create({
        type: 'USER_JOINED',
        title: 'New User Joined',
        message: `${user.fullName} (${user.role}) has joined Spurgo.`,
      });
      await this.adminNotificationsRepository.save(adminNotif);
    } catch (e) {
      console.error('Failed to create admin notification on verification:', e);
    }

    return {
      message: 'Email verified successfully',
      user: userWithoutPassword,
      accessToken,
    };
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    // Check if there is an active verification process
    const existingVerification = await this.emailVerificationRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!existingVerification) {
      throw new BadRequestException('No active verification process found for this email');
    }

    // Rate-limiting check
    const lastSent = existingVerification.lastSentAt || existingVerification.createdAt;
    const secondsSinceLastSent = Math.floor((Date.now() - lastSent.getTime()) / 1000);
    if (secondsSinceLastSent < 60) {
      throw new BadRequestException(
        `Please wait ${60 - secondsSinceLastSent} seconds before requesting a new code.`,
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Keep same configuration, update code, expiresAt, and lastSentAt
    existingVerification.code = code;
    existingVerification.expiresAt = expiresAt;
    existingVerification.lastSentAt = new Date();
    existingVerification.attempts = 0; // reset attempts
    
    await this.emailVerificationRepository.save(existingVerification);

    // Extract phone number if available in pending registration data
    let phoneNumber = '';
    if (existingVerification.registrationData) {
      try {
        const payload = JSON.parse(existingVerification.registrationData);
        phoneNumber = payload.phoneNumber || '';
      } catch (e) {}
    }

    if (phoneNumber) {
      this.smsService.sendOtp(phoneNumber, code).catch((e) => {
        console.error('Failed to send SMS OTP during resend:', e);
      });
    }

    if (existingVerification.purpose === 'password_reset') {
      this.mailService.sendPasswordReset(normalizedEmail, code).catch((e) => {
        console.error('Failed to send verification email during resend:', e);
      });
    } else {
      this.mailService.sendOtp(normalizedEmail, code).catch((e) => {
        console.error('Failed to send verification email during resend:', e);
      });
    }

    return { message: 'Verification code resent' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    // Check if user exists (only verified users can reset password)
    const user = await this.usersRepository.findOne({
      where: [
        { email: normalizedEmail, isEmailVerified: true },
        { phoneNumber: normalizedEmail, isEmailVerified: true },
      ],
    });
    if (!user) {
      throw new BadRequestException('User with this account does not exist');
    }

    // Rate-limiting check
    const existingVerification = await this.emailVerificationRepository.findOne({
      where: { email: normalizedEmail, purpose: 'password_reset' },
    });

    if (existingVerification) {
      const lastSent = existingVerification.lastSentAt || existingVerification.createdAt;
      const secondsSinceLastSent = Math.floor((Date.now() - lastSent.getTime()) / 1000);
      if (secondsSinceLastSent < 60) {
        throw new BadRequestException(
          `Please wait ${60 - secondsSinceLastSent} seconds before requesting a new code.`,
        );
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Delete any existing password reset verification codes for this email
    await this.emailVerificationRepository.delete({ email: normalizedEmail, purpose: 'password_reset' });

    // Save password reset verification code
    const verification = this.emailVerificationRepository.create({
      email: normalizedEmail,
      code,
      expiresAt,
      lastSentAt: new Date(),
      purpose: 'password_reset',
    });
    await this.emailVerificationRepository.save(verification);

    if (user.phoneNumber) {
      this.smsService.sendOtp(user.phoneNumber, code).catch((e) => {
        console.error('Failed to send SMS password reset OTP:', e);
      });
    }

    this.mailService.sendPasswordReset(normalizedEmail, code).catch((e) => {
      console.error('Failed to send password reset email:', e);
    });

    return { message: 'Password reset code sent successfully' };
  }

  async verifyResetOtp(email: string, code: string): Promise<{ resetToken: string }> {
    const normalizedEmail = email ? String(email).toLowerCase().trim() : '';
    const cleanCode = code !== undefined && code !== null ? String(code).trim() : '';

    const verification = await this.emailVerificationRepository.findOne({
      where: { email: normalizedEmail, purpose: 'password_reset' },
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification code');
    }

    if (new Date() > verification.expiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    const storedCode = verification.code !== undefined && verification.code !== null ? String(verification.code).trim() : '';
    if (storedCode !== cleanCode) {
      verification.attempts += 1;
      if (verification.attempts >= 5) {
        await this.emailVerificationRepository.delete({ email: normalizedEmail, purpose: 'password_reset' });
        throw new BadRequestException(
          'Too many failed attempts. This verification code has been invalidated. Please request a new one.',
        );
      } else {
        await this.emailVerificationRepository.save(verification);
        const remaining = 5 - verification.attempts;
        throw new BadRequestException(
          `Invalid verification code. ${remaining} attempts remaining.`,
        );
      }
    }

    // Code verified! Generate a short-lived reset token (15 mins)
    const resetToken = await this.jwtService.signAsync(
      { email: normalizedEmail, purpose: 'password_reset_authorized' },
      { expiresIn: '15m' },
    );

    // Invalidate the OTP verification record immediately
    await this.emailVerificationRepository.delete({ email: normalizedEmail, purpose: 'password_reset' });

    return { resetToken };
  }

  async resetPassword(resetData: any): Promise<{ message: string }> {
    const { resetToken, newPassword, confirmPassword } = resetData;

    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(resetToken);
    } catch (e) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (payload.purpose !== 'password_reset_authorized' || !payload.email) {
      throw new BadRequestException('Invalid password reset token');
    }

    const email = payload.email;
    const user = await this.usersRepository.findOne({
      where: { email, isEmailVerified: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.usersRepository.save(user);

    return { message: 'Password reset successfully' };
  }
}
