import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export enum NotificationType {
  MATCH_REQUEST = 'match_request',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  sender: User;

  @ManyToOne(() => User, { eager: true })
  receiver: User;

  @ManyToOne(() => User, { eager: true, nullable: true })
  assignedMod: User | null;

  @Column({ nullable: true })
  requestId: string; // The request this match is related to

  @Column({ nullable: true })
  offerId: string; // The offer this match is related to

  @Column({
    type: 'simple-enum',
    enum: NotificationType,
    default: NotificationType.MATCH_REQUEST,
  })
  type: NotificationType;

  @Column({
    type: 'simple-enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ nullable: true })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
