import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas';
import {
  BlockchainService,
  TelegramService,
  TgMenuService,
  TransactionListener,
  UserService,
} from './services';
import * as process from 'node:process';
import { ConfigModule } from '@nestjs/config';
import { BNB_NETWORK, EthersModule } from 'nestjs-ethers';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGO_URI ?? ''),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    EthersModule.forRoot({
      network: BNB_NETWORK,
      custom: 'https://bsc-dataseed.binance.org',
      useDefaultProvider: false,
    }),
  ],
  providers: [
    UserService,
    TelegramService,
    BlockchainService,
    TgMenuService,
    TransactionListener,
  ],
})
export class AppModule {}
