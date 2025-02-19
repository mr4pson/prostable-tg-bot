import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PullTransaction } from '../schemas';
import { PullTransactionType } from 'src/common';

@Injectable()
export class PullTransactionService {
  constructor(
    @InjectModel(PullTransaction.name)
    private pullTransactionModel: Model<PullTransaction>,
  ) {}

  async findAllPullTransactions(): Promise<PullTransaction[]> {
    return this.pullTransactionModel.find();
  }

  async findPullTransactionsByTypeForLastDay(
    type: PullTransactionType,
  ): Promise<PullTransaction[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.pullTransactionModel.find({
      type,
      createdAt: { $gte: oneDayAgo },
    });
  }

  async calculateCashboxPullTransactionsSum(): Promise<number> {
    const pullTransactions = await this.findPullTransactionsByTypeForLastDay(
      PullTransactionType.CASH_BOX,
    );

    return pullTransactions.reduce((acc, pullTransaction) => {
      return acc + pullTransaction.price;
    }, 0);
  }

  async create(payload: Partial<PullTransaction>) {
    try {
      return this.pullTransactionModel.create(payload);
    } catch (error) {
      console.log(error);

      return false;
    }
  }
}
