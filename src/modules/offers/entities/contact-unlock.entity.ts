import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Offer } from './offer.entity';

// A customer who may see the store behind an offer (client doc §3).
@Entity('contact_unlocks')
@Unique(['user', 'offer'])
export class ContactUnlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Offer, { onDelete: 'CASCADE' })
  offer: Offer;

  @Column()
  via: string; // trial | search_normal | search_smart | points

  @CreateDateColumn()
  createdAt: Date;
}
