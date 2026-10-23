import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_plans')
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  planId: string; // e.g. 'basic', 'pro', 'elite'

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @Column({ type: 'float' })
  price: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'int' })
  points: number;

  @Column({ default: false })
  isPopular: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'json', nullable: true })
  featuresEn: string[];

  @Column({ type: 'json', nullable: true })
  featuresAr: string[];

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
