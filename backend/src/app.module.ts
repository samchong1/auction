import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionModule } from './auction/auction.module';
import { Product } from './entities/product.entity';
import { Bid } from './entities/bid.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: Number(config.get<number>('DB_PORT')) || 3306,
        username: config.get<string>('DB_USER') || 'root',
        password: config.get<string>('DB_PASS') || '',
        database: config.get<string>('DB_NAME') || 'auction_db',
        entities: [Product, Bid],
        synchronize: true,
      }),
    }),
    AuctionModule,
  ],
})
export class AppModule {}
