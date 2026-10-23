import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('email_verifications')
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  code: string;

  @Column()
  expiresAt: Date;

  @Column({ default: 0 })
  attempts: number;

  @Column({ nullable: true })
  lastSentAt: Date;

  @Column({ nullable: true })
  registrationData: string;

  @Column({ default: 'registration' })
  purpose: string;

  @CreateDateColumn()
  createdAt: Date;
}
