import { Injectable } from '@nestjs/common';
import BeeQueue from 'bee-queue';
import moment from 'moment';

import {
  BeeQueues,
  BeeQueueService,
  CurrencyType,
  getMillisecondsUntil9,
  PullTransactionType,
} from 'src/common';
import { PullTransactionService, UserService } from 'src/services';

@Injectable()
export class CashboxPullProcessor {
  public readonly queue: { [key: string]: BeeQueue } = {};
  constructor(
    private readonly beeQueueService: BeeQueueService,
    private readonly pullTransactionService: PullTransactionService,
    private readonly userService: UserService,
  ) {
    const beeQueueConfig = {
      prefix: 'bq',
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASS,
        db: 0,
        options: {},
      },
      isWorker: true,
      activateDelayedJobs: true,
      removeOnSuccess: true,
      removeOnFailure: true,
      autoConnect: true,
    };
    this.queue = {
      [BeeQueues.DAILY_CASH_BOX_PULL]: new BeeQueue(
        BeeQueues.DAILY_CASH_BOX_PULL,
        beeQueueConfig,
      ),
    };

    this.queue[BeeQueues.DAILY_CASH_BOX_PULL].process(async (job, done) => {
      const lastCashBoxTopupTransaction =
        await pullTransactionService.findPullTransactionsByTypeForLastDay(
          PullTransactionType.CASH_BOX_TOPUP,
        );

      if (
        lastCashBoxTopupTransaction.length &&
        new Date(
          lastCashBoxTopupTransaction[
            lastCashBoxTopupTransaction.length - 1
          ].createdAt,
        ).getDate() === new Date().getDate()
      ) {
        console.log('Cashbox transaction has already been created');

        setTimeout(async () => {
          const queue = this.beeQueueService.getQueue(
            BeeQueues.DAILY_CASH_BOX_PULL,
          );
          const delayNumber = getMillisecondsUntil9();

          await this.beeQueueService.removeJob(queue, '1');
          await this.beeQueueService.addJob(queue, {}, delayNumber, '1');

          console.log(
            'daily cashbox pull job declined: ',
            job.id,
            'daily cashbox pull job declined at: ',
            moment(new Date()).format('hh:mm:ss'),
          );
        });
        return;
      }

      const cashboxPullTransactionsSum =
        await this.pullTransactionService.calculateCashboxPullTransactionsSum();
      const usersCount = await this.userService.getUsersCount();
      const dailyCashboxPullValue = cashboxPullTransactionsSum / usersCount;

      await pullTransactionService.create({
        type: PullTransactionType.CASH_BOX_TOPUP,
        price: dailyCashboxPullValue,
        currencyType: CurrencyType.ROST,
      });
      await this.userService.updateMany(
        { tgUserId: { $ne: process.env.TECH_ACC_TG_ID } },
        {
          $inc: { rostBalance: dailyCashboxPullValue },
        },
      );

      console.log(
        usersCount,
        cashboxPullTransactionsSum,
        dailyCashboxPullValue,
      );

      setTimeout(async () => {
        const queue = this.beeQueueService.getQueue(
          BeeQueues.DAILY_CASH_BOX_PULL,
        );
        const delayNumber = getMillisecondsUntil9();

        await this.beeQueueService.removeJob(queue, '1');
        await this.beeQueueService.addJob(queue, {}, delayNumber, '1');

        console.log(
          'daily cashbox pull job processed: ',
          job.id,
          'daily cashbox pull job completed at: ',
          moment(new Date()).format('hh:mm:ss'),
        );
      });

      return done(null);
    });
  }
}
