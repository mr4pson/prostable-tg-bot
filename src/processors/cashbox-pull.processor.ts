import { Injectable } from '@nestjs/common';
import BeeQueue from 'bee-queue';
import moment from 'moment';
import { Types } from 'mongoose';

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
        await this.pullTransactionService.findPullTransactionsByTypeForLast3Hours(
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
            'daily cashbox pull job declined at: ',
            moment(new Date()).format('DD.MM.YYYY hh:mm:ss'),
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
      const remainingFeatures =
        await this.getRemainingAccountsAndTopupLimitAccounts(
          activeUserIds,
          dailyCashboxPullValue,
        );

      for (const userIdWithFullCashboxTopupLimit of remainingFeatures.activeUserIds) {
        if (remainingFeatures.dailyCashboxPullValue) {
          await this.pullTransactionService.create({
            type: PullTransactionType.CASH_BOX_TOPUP,
            receiver: userIdWithFullCashboxTopupLimit,
            price: roundDecimals(remainingFeatures.dailyCashboxPullValue),
            currencyType: CurrencyType.ROST,
          });
          await this.userService.updateUserById(
            userIdWithFullCashboxTopupLimit,
            {
              $inc: {
                rostBalance: roundDecimals(
                  remainingFeatures.dailyCashboxPullValue,
                ),
              },
            },
          );
        }
      }

      console.log(
        usersCount,
        cashboxPullTransactionsSum,
        dailyCashboxPullValue,
        remainingFeatures,
      );

      setTimeout(async () => {
        const queue = this.beeQueueService.getQueue(
          BeeQueues.DAILY_CASH_BOX_PULL,
        );
        const delayNumber = 3_600_000 * 3;

        await this.beeQueueService.removeJob(queue, '1');
        await this.beeQueueService.addJob(queue, {}, delayNumber, '1');

        console.log(
          'daily cashbox pull job completed at: ',
          moment(new Date()).format('DD.MM.YYYY hh:mm:ss'),
        );
      });

      return done(null);
    });
  }

  private async getRemainingAccountsAndTopupLimitAccounts(
    activeUserIds: Types.ObjectId[],
    dailyCashboxPullValue: number,
  ): Promise<{
    activeUserIds: Types.ObjectId[];
    dailyCashboxPullValue: number;
  }> {
    let remainingCashboxTopupSum = 0;
    const userIdsWithFullCashboxTopupLimit = [];

    for (const activeUserId of activeUserIds) {
      const userInvestSum =
        await this.transactionService.getUserAllInvestSum(activeUserId);
      const userCashboxTopupSum =
        await this.pullTransactionService.getUserCashboxTopupSum(activeUserId);
      const userTopupLimit = userInvestSum - userCashboxTopupSum;
      let userTopupValue = 0;

      if (userTopupLimit < dailyCashboxPullValue) {
        userTopupValue = userTopupLimit;

        const topupTechAcc = dailyCashboxPullValue - userTopupLimit;
        remainingCashboxTopupSum += topupTechAcc;

        if (userTopupValue) {
          await this.pullTransactionService.create({
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
      } else {
        userIdsWithFullCashboxTopupLimit.push(activeUserId);
      }
    }

    const remainingDailyCashboxPullValue =
      dailyCashboxPullValue +
      remainingCashboxTopupSum / userIdsWithFullCashboxTopupLimit.length;

    if (activeUserIds.length !== userIdsWithFullCashboxTopupLimit.length) {
      return this.getRemainingAccountsAndTopupLimitAccounts(
        userIdsWithFullCashboxTopupLimit,
        remainingDailyCashboxPullValue,
      );
    }

    return {
      activeUserIds: userIdsWithFullCashboxTopupLimit,
      dailyCashboxPullValue: remainingDailyCashboxPullValue,
    };
  }
}
