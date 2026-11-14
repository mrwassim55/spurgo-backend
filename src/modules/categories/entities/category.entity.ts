import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nameAr: string;

  @Column({ default: '' })
  nameEn: string;

  @Column({ default: '' })
  slug: string;

  @Column({ default: 'fa-cogs' })
  icon: string;

  // 'all' | 'marketplace' | 'requests'
  @Column({ default: 'all' })
  scope: string;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

