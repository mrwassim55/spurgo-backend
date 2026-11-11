import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum PopupTargetPage {
  ALL = 'all',
  HOME = 'home',
  CREATE_REQUEST = 'create_request',
  CHOOSE_PLAN = 'choose_plan',
  POINTS_HISTORY = 'points_history',
  REQUESTS = 'requests',
  OFFERS = 'offers',
  PROFILE = 'profile',
}

export enum PopupTargetRole {
  ALL = 'all',
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  STAFF = 'staff',
}

export enum PopupType {
  INFO = 'info',
  PROMO = 'promo',
  ALERT = 'alert',
  REWARD = 'reward',
}

@Entity('in_app_popups')
export class InAppPopup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  titleAr: string;

  @Column({ default: '' })
  titleEn: string;

  @Column({ type: 'text', default: '' })
  messageAr: string;

  @Column({ type: 'text', default: '' })
  messageEn: string;

  @Column({ default: PopupTargetPage.ALL })
  targetPage: string;

  @Column({ default: PopupTargetRole.ALL })
  targetRole: string;

  @Column({ default: PopupType.INFO })
  type: string;

  @Column({ default: 'sparkles' })
  icon: string;

  @Column({ default: 'فهمت' })
  buttonTextAr: string;

  @Column({ default: 'Got it' })
  buttonTextEn: string;

  @Column({ default: 'dismiss' })
  buttonAction: string; // 'dismiss' | 'route' | 'url'

  @Column({ nullable: true })
  buttonRoute: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  viewsCount: number;

  @Column({ default: 0 })
  clicksCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

