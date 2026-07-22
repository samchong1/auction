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
  
  async onModuleInit() {}


  async getProduct(): Promise<{ product: Product & { currentPrice: string }; serverTime: string }> {
    const [product] = await this.productRepo.find({
      relations: ['bids'],
      order: { createdAt: 'DESC' },
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

    async placeBid(bidderName: string, amount: number) {
        let product: Product;
        let isNewProduct = false;

        // Try to load the latest product; if none exists, create one for this first bidder.
        const [result] = await this.productRepo.find({
            relations: ['bids'],
            order: { createdAt: 'DESC' },
            take: 1,
        });

        product = result

        if (!product) {
            const now = new Date();
            const ends = new Date(now.getTime() + 60 * 1000);
            const p = this.productRepo.create({
                title: `Auction Item ${Date.now()}`,
                startingPrice: amount.toFixed(2),
                timerStartsAt: now,
                timerEndsAt: ends,
            });
            await this.productRepo.save(p);
            this.setTimer(p.id, ends);
            product = await this.productRepo.findOneOrFail({ where: { id: p.id }, relations: ['bids'] });
            isNewProduct = true;
        } else {
            // If stored product has no timerEndsAt (ended), create a new product for this bid
            if (!product.timerEndsAt) {
                const now = new Date();
                const ends = new Date(now.getTime() + 60 * 1000);
                const p = this.productRepo.create({
                    title: `Auction Item ${Date.now()}`,
                    startingPrice: amount.toFixed(2),
                    timerStartsAt: now,
                    timerEndsAt: ends,
                });
                await this.productRepo.save(p);
                this.setTimer(p.id, ends);
                product = await this.productRepo.findOneOrFail({ where: { id: p.id }, relations: ['bids'] });
                isNewProduct = true;
            } else {
                if (!product.timerStartsAt) {
                    throw new BadRequestException('Product auction timing is invalid');
                }
                const starts = new Date(product.timerStartsAt);
                const ends = new Date(product.timerEndsAt);
                const now = new Date();

                // If auction already ended (ends <= now), create a new product/timer
                if (ends.getTime() <= now.getTime()) {
                const now2 = new Date();
                const ends2 = new Date(now2.getTime() + 60 * 1000);
                const p = this.productRepo.create({
                    title: `Auction Item ${Date.now()}`,
                    startingPrice: amount.toFixed(2),
                    timerStartsAt: now2,
                    timerEndsAt: ends2,
                });
                await this.productRepo.save(p);
                this.setTimer(p.id, ends2);
                product = await this.productRepo.findOneOrFail({ where: { id: p.id }, relations: ['bids'] });
                isNewProduct = true;
                } else {
                    // Auction ends in the future. If it was scheduled to start later, start it now on first bid.
                    if (now.getTime() < starts.getTime()) {
                        const newStarts = now;
                        const newEnds = new Date(now.getTime() + 60 * 1000);
                        product.timerStartsAt = newStarts;
                        product.timerEndsAt = newEnds;
                        await this.productRepo.save(product);
                        this.setTimer(product.id, newEnds);
                    }
                }
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
        // Accept the incoming bid if we just created the product for this bidder.
        if (!isNewProduct && incoming <= current) throw new BadRequestException('Bid must be greater than current price');

        // If product exists but had no timer (edge case), start it now.
        if (!product.timerEndsAt) {
        const now = new Date();
        const ends = new Date(Date.now() + 60 * 1000);
        product.timerStartsAt = now;
        product.timerEndsAt = ends;
        await this.productRepo.save(product);
        this.setTimer(product.id, ends);
        }

        const bid = this.bidRepo.create({ productId: product.id, bidderName, amount: incoming.toFixed(2) as any });
        const savedBid = await this.bidRepo.save(bid);

        const responseProduct = {
        ...product,
        bids: [...(product.bids || []), savedBid],
        currentPrice: savedBid.amount,
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

      const topBid = await this.bidRepo.findOne({ where: { productId }, order: { amount: 'DESC' } });
      this.gateway.broadcastAuctionEnd({ product, winner: topBid, serverTime: new Date().toISOString() });
    } catch (err) {
      this.logger.error('Error ending auction', err);
    }
  }
}
