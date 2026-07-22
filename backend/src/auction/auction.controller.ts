import { Controller, Get, Post, Body } from '@nestjs/common';
import { AuctionService } from './auction.service';
import { CreateBidDto } from './dto/create-bid.dto';

@Controller('auction')
export class AuctionController {
  constructor(private service: AuctionService) {}

  @Get('product')
  async getProduct() {
    return this.service.getProduct();
  }

  @Post('bid')
  async placeBid(@Body() body: CreateBidDto) {
    return this.service.placeBid(body.productId, body.bidderName, body.amount);
  }
}
