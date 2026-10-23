import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AccessoryRequest } from '../../requests/entities/accessory-request.entity';

export enum OfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.id)
  supplier: User;

  @ManyToOne(() => AccessoryRequest, (request) => request.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  request: AccessoryRequest;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column()
  condition: string; // New, Used, Refurbished

  @Column()
  deliveryTime: string; // e.g. 1-2 days

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  city: string;

  @Column()
  region: string;

  @Column({ nullable: true })
  vehicleBrand: string;

  @Column({ nullable: true })
  vehicleModel: string;

  @Column({ nullable: true })
  vehicleYear: string;

  @Column({ nullable: true })
  vehicleEngine: string;

  @Column({ nullable: true })
  fuelType: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ nullable: true })
  manufactureCountry: string;

  @Column({ nullable: true })
  brandOriginCountry: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({
    type: 'simple-enum',
    enum: OfferStatus,
    default: OfferStatus.PENDING,
  })
  status: OfferStatus;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  inStore: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
