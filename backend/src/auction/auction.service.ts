import { BadRequestException, Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Bid } from '../entities/bid.entity';
import { AuctionGateway } from './auction.gateway';

@Injectable()
export class AuctionService implements OnModuleInit {
  private readonly logger = new Logger(AuctionService.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Bid) private bidRepo: Repository<Bid>,
    private gateway: AuctionGateway,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultProduct();
  }

  async ensureDefaultProduct() {
    const count = await this.productRepo.count();
    if (count === 0) {
      const start = new Date(Date.now() + 10 * 60 * 1000)
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      const p = this.productRepo.create({
        title: 'Exclusive Artwork',
        startingPrice: '10000.00',
        timerStartsAt: start,
        timerEndsAt: end,
      });
      await this.productRepo.save(p);
      this.logger.log('Seeded default product');
    }
  }

  async getProduct(): Promise<{ product: Product & { currentPrice: string }; serverTime: string }> {
    const [product] = await this.productRepo.find({
      relations: ['bids'],
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!product) throw new NotFoundException('No product found');
    const latestBid = product.bids?.length
      ? product.bids.reduce((highest: Bid, next: Bid) =>
          parseFloat(next.amount) > parseFloat(highest.amount) ? next : highest,
          product.bids[0],
        )
      : null;
    return {
      product: { ...product, currentPrice: latestBid ? latestBid.amount : product.startingPrice },
      serverTime: new Date().toISOString(),
    };
  }

  private async getFirstProduct(): Promise<Product> {
    const [product] = await this.productRepo.find({
        relations: ['bids'],
        order: { createdAt: 'ASC' },
        take: 1,
    });
    if (!product) throw new NotFoundException('No product found');
    return product;
  }

  async placeBid(productId: string | undefined, bidderName: string, amount: number) {
    let product: Product;
    if (productId) {
      product = await this.productRepo.findOneOrFail({
        where: { id: productId },
        relations: ['bids'],
      });
    } else {
      // No productId provided: use the first available product for this assessment
      product = await this.getFirstProduct();
    }
    if (product.timerEndsAt) {
      if (!product.timerStartsAt) {
        throw new BadRequestException('Product auction timing is invalid');
      }
      const starts = new Date(product.timerStartsAt);
      const ends = new Date(product.timerEndsAt);
      if (ends.getTime() <= starts.getTime()) {
        throw new BadRequestException('Product auction timing is invalid');
      }

      const now = new Date();
      if (now.getTime() < starts.getTime()) {
        // Auction has not started yet
        throw new BadRequestException('Auction has not started');
      }

      if (ends.getTime() <= now.getTime()) {
        product.timerEndsAt = new Date(0);
        await this.productRepo.save(product);
        throw new BadRequestException('Auction ended');
      }
    }

    const latestBid = product.bids?.length
      ? product.bids.reduce((highest: Bid, next: Bid) =>
          parseFloat(next.amount) > parseFloat(highest.amount) ? next : highest,
          product.bids[0],
        )
      : null;
    const current = latestBid ? parseFloat(latestBid.amount) : parseFloat(product.startingPrice);
    const incoming = amount;
    if (!Number.isFinite(incoming)) {
      throw new BadRequestException('Bid amount must be a valid number');
    }
    if (incoming > 9999999999999) {
      throw new BadRequestException('Bid amount out of range');
    }
    if (incoming <= current) throw new BadRequestException('Bid must be greater than current price');

    // If first bid, start auction timer
    if (!product.timerEndsAt) {
      const now = new Date();
      const ends = new Date(Date.now() + 60 * 1000);
      product.timerStartsAt = now;
      product.timerEndsAt = ends;
      await this.productRepo.save(product);
      this.setTimer(product.id, ends);
    }

    const bid = this.bidRepo.create({ productId: product.id, bidderName, amount });
    const savedBid = await this.bidRepo.save(bid);

    const responseProduct = {
      ...product,
      bids: [...(product.bids || []), savedBid],
      currentPrice: amount,
    };

    // Broadcast to clients
    this.gateway.broadcastBidUpdate({ product: responseProduct, bid: savedBid, serverTime: new Date().toISOString() });

    return { product: responseProduct, bid: savedBid };
  }

  private setTimer(productId: string, endsAt: Date) {
    const ms = endsAt.getTime() - Date.now();
    if (ms <= 0) return this.endAuction(productId);
    if (this.timers.has(productId)) clearTimeout(this.timers.get(productId));
    const t = setTimeout(() => this.endAuction(productId), ms);
    this.timers.set(productId, t);
  }

  private async endAuction(productId: string) {
    try {
      const product = await this.productRepo.findOneOrFail({ where: { id: productId } });
      product.timerEndsAt = new Date(0);
      await this.productRepo.save(product);

      const topBid = await this.bidRepo.findOne({ where: { productId }, order: { amount: 'DESC' } });
      this.gateway.broadcastAuctionEnd({ product, winner: topBid, serverTime: new Date().toISOString() });
    } catch (err) {
      this.logger.error('Error ending auction', err);
    }
  }
}
