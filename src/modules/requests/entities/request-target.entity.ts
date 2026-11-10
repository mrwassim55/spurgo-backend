import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AccessoryRequest } from './accessory-request.entity';

export enum TargetStatus {
  PENDING = 'pending',
  OFFERED = 'offered',
  DECLINED = 'declined',
  UNAVAILABLE = 'unavailable',
}

// A store a request was sent to, and how it answered.
@Entity('request_targets')
@Unique(['request', 'supplier'])
export class RequestTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AccessoryRequest, { onDelete: 'CASCADE' })
  request: AccessoryRequest;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  supplier: User;

  @Column({ type: 'simple-enum', enum: TargetStatus, default: TargetStatus.PENDING })
  status: TargetStatus;

  @Column({ type: 'int', default: 0 })
  nudges: number;

  @Column({ nullable: true })
  lastNudgedAt?: Date;

  @Column({ nullable: true })
  respondedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
