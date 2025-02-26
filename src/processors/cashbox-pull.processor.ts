import { Injectable } from '@nestjs/common';
import BeeQueue from 'bee-queue';
import moment from 'moment';

import {
  BeeQueues,
  BeeQueueService,
  CurrencyType,
  PullTransactionType,
  roundDecimals,
} from 'src/common';
import {
  PullTransactionService,
  TransactionService,
  UserService,
} from 'src/services';

@Injectable()
export class CashboxPullProcessor {
  public readonly queue: { [key: string]: BeeQueue } = {};
  constructor(
    private readonly beeQueueService: BeeQueueService,
    private readonly pullTransactionService: PullTransactionService,
    private readonly transactionService: TransactionService,
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
        await pullTransactionService.findPullTransactionsByTypeForLast3Hours(
          PullTransactionType.CASH_BOX_TOPUP,
        );

      if (
        lastCashBoxTopupTransaction.length &&
        new Date(
          lastCashBoxTopupTransaction[
            lastCashBoxTopupTransaction.length - 1
          ].createdAt,
        ).getHours() === new Date().getHours()
      ) {
        console.log('Cashbox transaction has already been created');

        setTimeout(async () => {
          const queue = this.beeQueueService.getQueue(
            BeeQueues.DAILY_CASH_BOX_PULL,
          );
          const delayNumber = 3_600_000 * 3;

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
      const activeUserIds = await this.userService.getActiveUserIds();
      const usersCount = activeUserIds.length;
      const dailyCashboxPullValue = roundDecimals(
        cashboxPullTransactionsSum / usersCount,
      );
      const techUser = await this.userService.findUserByTgId(
        Number(process.env.TECH_ACC_TG_ID),
      );

      for (const activeUserId of activeUserIds) {
        const userInvestSum =
          await this.transactionService.getUserInvestSum(activeUserId);
        const userCashboxTopupSum =
          await this.pullTransactionService.getUserCashboxTopupSum(
            activeUserId,
          );
        const userTopupLimit = userInvestSum - userCashboxTopupSum;
        let userTopupValue = 0;

        if (userTopupLimit < dailyCashboxPullValue) {
          userTopupValue = userTopupLimit;

          const topupTechAcc = dailyCashboxPullValue - userTopupLimit;

          await pullTransactionService.create({
            type: PullTransactionType.CASH_BOX_TOPUP_TECH_ACC,
            receiver: techUser._id as any,
            price: topupTechAcc,
            currencyType: CurrencyType.ROST,
          });
          await this.userService.updateUserById(techUser._id as any, {
            $inc: {
              rostBalance: topupTechAcc,
            },
          });
        } else {
          userTopupValue = dailyCashboxPullValue;
        }

        await pullTransactionService.create({
          type: PullTransactionType.CASH_BOX_TOPUP,
          receiver: activeUserId,
          price: roundDecimals(userTopupValue),
          currencyType: CurrencyType.ROST,
        });
        await this.userService.updateUserById(activeUserId, {
          $inc: {
            rostBalance: roundDecimals(userTopupValue),
          },
        });
      }

      console.log(
        usersCount,
        cashboxPullTransactionsSum,
        dailyCashboxPullValue,
      );

      setTimeout(async () => {
        const queue = this.beeQueueService.getQueue(
          BeeQueues.DAILY_CASH_BOX_PULL,
        );
        const delayNumber = 3_600_000 * 3;

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
