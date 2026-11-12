import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum UserRole {
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  STAFF = 'staff',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  password: string;

  @Column()
  fullName: string;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  role: UserRole;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  whatsapp: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ nullable: true })
  fcmToken: string;

  // Supplier specific fields
  @Column({ nullable: true })
  companyName: string;

  @Column({ nullable: true })
  companyLogo: string;

  @Column({ nullable: true })
  taxId: string;

  @Column({ nullable: true })
  specializations: string; // Stored as comma separated or JSON string

  // Location fields
  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  address: string;

  @Column({ default: 0 })
  points: number; // balance; movements live in points_entries

  // Free trial end (customers). Only usable during shop hours, see rules.isTrialActive.
  @Column({ nullable: true })
  trialEndsAt?: Date; // Date-typed so TypeORM picks datetime (sqlite) / timestamp (postgres)

  @Column({ nullable: true })
  activePlan?: string;

  @Column({ nullable: true })
  activePlanStatus?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isApproved: boolean;

  @Column({ type: 'simple-array', nullable: true })
  verificationDocuments: string[];

  @Column({ default: 'pending' })
  verificationStatus: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
