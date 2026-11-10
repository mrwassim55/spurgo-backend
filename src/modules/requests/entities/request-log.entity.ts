import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AccessoryRequest } from './accessory-request.entity';

// Agent (مندوب) follow-up trail: every call/update with its time (client doc §6.5).
@Entity('request_logs')
export class RequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AccessoryRequest, { onDelete: 'CASCADE' })
  request: AccessoryRequest;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  author: User;

  @Column()
  type: string; // store_contact | customer_contact | update | system

  @Column({ type: 'text' })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
