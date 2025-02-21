import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import * as process from 'node:process';
import { ConfigModule } from '@nestjs/config';
import { BNB_NETWORK, EthersModule } from 'nestjs-ethers';
import { MoralisService } from './services/moralis.service';
import { TransactionController } from './controllers/transaction.controller';
import { CashboxPullProcessor } from './processors';
import {
  BeeQueueModule,
  BeeQueues,
  BeeQueueService,
  getMillisecondsUntil9,
} from './common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    const delayNumberForDailyClean = getMillisecondsUntil9();

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
