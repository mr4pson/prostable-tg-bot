import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BNB_NETWORK, EthersModule } from 'nestjs-ethers';
import * as process from 'node:process';
import {
  BeeQueueModule,
  BeeQueues,
  BeeQueueService,
  DataCacheModule,
} from './common';
import { TransactionController } from './controllers/transaction.controller';
import { CashboxPullProcessor } from './processors';
import {
  PullTransaction,
  PullTransactionSchema,
  Transaction,
  TransactionSchema,
  User,
  UserSchema,
} from './schemas';
import {
  BlockchainService,
  PullTransactionService,
  TelegramService,
  TgMenuService,
  TransactionService,
  UserService,
} from './services';
import { MoralisService } from './services/moralis.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DataCacheModule,
    MongooseModule.forRoot(process.env.MONGO_URI ?? ''),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: PullTransaction.name, schema: PullTransactionSchema },
    ]),
    EthersModule.forRoot({
      network: BNB_NETWORK,
      custom: 'https://bsc-dataseed.binance.org',
      useDefaultProvider: false,
    }),
    BeeQueueModule,
  ],
  controllers: [TransactionController],
  providers: [
    UserService,
    TelegramService,
    BlockchainService,
    TgMenuService,
    CashboxPullProcessor,
    MoralisService,
    TransactionService,
    PullTransactionService,
  ],
})
export class AppModule {
  constructor(private beeQueueService: BeeQueueService) {
    const dailyCashboxPullQueue = this.beeQueueService.getQueue(
      BeeQueues.DAILY_CASH_BOX_PULL,
    );
    const delayNumberForDailyClean = 3_600_000 * 3;

    this.beeQueueService
      .removeJob(dailyCashboxPullQueue, '1')
      .then(async () => {
        await this.beeQueueService.addJob(
          dailyCashboxPullQueue,
          {},
          delayNumberForDailyClean,
          '1',
        );
      });
  }
}
