import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from './user.entity';

// One row per points movement; user.points is the running balance.
@Entity('points_entries')
@Index(['user', 'reason', 'ref'])
export class PointsEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'int' })
  amount: number; // negative = spent

  @Column()
  reason: string; // signup | paid | purchase | offer | decline | sale | rating_request | rated | customer_rating | unlock | admin

  @Column({ nullable: true })
  requestId: string; // linked request, shown in history

  @Column({ nullable: true })
  ref: string; // idempotency key (requestId / offerId / payment ref)

  @CreateDateColumn()
  createdAt: Date;
}
