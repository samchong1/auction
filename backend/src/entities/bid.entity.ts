import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class Bid {
  @PrimaryGeneratedColumn('increment')
  id: string;

  @ManyToOne(() => Product, (product) => product.bids, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column()
  bidderName: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: string;

  @CreateDateColumn()
  createdAt: Date;
}
