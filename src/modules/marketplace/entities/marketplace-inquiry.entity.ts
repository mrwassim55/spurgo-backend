import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MarketplaceItem } from './marketplace-item.entity';

@Entity('marketplace_inquiries')
export class MarketplaceInquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MarketplaceItem, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'itemId' })
  item: MarketplaceItem;

  @Column({ nullable: true })
  itemId: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  customerName: string;

  @Column()
  customerPhone: string;

  @Column({ nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: 'pending' })
  status: string; // pending | contacted | completed | cancelled

  @CreateDateColumn()
  createdAt: Date;
}

