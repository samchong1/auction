import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({ cors: true, namespace: '/' })
@Injectable()
export class AuctionGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  broadcastBidUpdate(payload: any) {
    this.server.emit('bid_updated', payload);
  }

  broadcastAuctionEnd(payload: any) {
    this.server.emit('auction_ended', payload);
  }
}
