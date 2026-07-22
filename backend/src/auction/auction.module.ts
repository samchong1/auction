import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionService } from './auction.service';
import { AuctionGateway } from './auction.gateway';
import { Product } from '../entities/product.entity';
import { Bid } from '../entities/bid.entity';
import { AuctionController } from './auction.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Bid])],
  providers: [AuctionService, AuctionGateway],
  controllers: [AuctionController],
  exports: [AuctionService],
})
export class AuctionModule {}
