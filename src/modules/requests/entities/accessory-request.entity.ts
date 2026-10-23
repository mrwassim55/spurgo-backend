import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum RequestStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('accessory_requests')
export class AccessoryRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ nullable: true })
  manufactureCountry: string;

  @Column()
  vehicleYear: string;

  @Column()
  vehicleBrand: string;

  @Column()
  vehicleModel: string;

  @Column()
  vehicleEngine: string;

  @Column({ nullable: true })
  fuelType: string;

  @Column()
  category: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  region: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ type: 'text', nullable: true })
  vehicleImageUrl?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({
    type: 'simple-enum',
    enum: RequestStatus,
    default: RequestStatus.PENDING,
  })
  status: RequestStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
