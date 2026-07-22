import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Bid } from './bid.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('increment')
  id: string;

  @Column()
  title: string;

  @Column('decimal', { precision: 15, scale: 2 })
  startingPrice: string;

  @Column({ type: 'timestamp', nullable: true })
  timerStartsAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  timerEndsAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Bid, (bid) => bid.product)
  bids: Bid[];
}
