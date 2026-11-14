import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PartCondition = 'new' | 'used' | 'oem' | 'aftermarket';

@Entity('marketplace_items')
export class MarketplaceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  titleAr: string;

  @Column({ nullable: true })
  titleEn: string;

  @Column({ nullable: true })
  partNumber: string;

  @Column({ default: 'الكل' })
  make: string; // e.g. "Toyota", "Hyundai", "Mercedes", "BMW", "Volkswagen", "Kia", "Nissan"

  @Column({ default: 'الكل' })
  model: string;

  @Column({ type: 'int', nullable: true })
  yearStart: number;

  @Column({ type: 'int', nullable: true })
  yearEnd: number;

  @Column({ default: 'قطع المحرك' })
  category: string;

  @Column({ default: 'new' })
  condition: string; // new | used | oem | aftermarket

  @Column({ type: 'float' })
  price: number;

  @Column({ type: 'float', nullable: true })
  originalPrice: number;

  @Column({ default: 'LYD' })
  currency: string;

  @Column({ type: 'int', default: 1 })
  stockQuantity: number;

  @Column({ default: true })
  isAvailable: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];

  @Column({ default: 'طرابلس' })
  city: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ nullable: true })
  contactWhatsapp: string;

  @Column({ type: 'int', default: 0 })
  viewsCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

