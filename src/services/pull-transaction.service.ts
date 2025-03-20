import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PullTransaction, Transaction } from '../schemas';
import { PullTransactionType } from 'src/common';

type PullOriginTransaction = PullTransaction & { originTx?: Transaction };

@Injectable()
export class PullTransactionService {
  constructor(
    @InjectModel(PullTransaction.name)
    private pullTransactionModel: Model<PullTransaction>,
  ) {}

  async findAllPullTransactions(): Promise<PullTransaction[]> {
    return this.pullTransactionModel.find();
  }

  async findAllUserPullTransactions(
    userId: Types.ObjectId,
  ): Promise<Array<PullOriginTransaction>> {
    const bussinessTransactions: Array<PullOriginTransaction> =
      await this.pullTransactionModel.aggregate([
        {
          $match: {
            type: PullTransactionType.BUSINESS,
            price: { $gt: 0 },
          },
        },
        {
          $lookup: {
            from: 'transactions',
            localField: 'origin',
            foreignField: '_id',
            as: 'originTx',
          },
        },
        {
          $unwind: '$originTx',
        },
        {
          $match: {
            'originTx.user': userId,
          },
        },
      ]);

    const restPullTransactions = await this.pullTransactionModel.find({
      receiver: userId,
      price: { $gt: 0 },
    });

    return bussinessTransactions.concat(restPullTransactions).sort((a, b) => {
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  async findPullTransactionsByTypeForLast3Hours(
    type: PullTransactionType,
  ): Promise<PullTransaction[]> {
    const oneDayAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    return this.pullTransactionModel.find({
      type,
      createdAt: { $gte: oneDayAgo },
    });
  }

  async getUserCashboxTopupSum(userId: Types.ObjectId): Promise<number> {
    return this.getUserPriceSum(userId, PullTransactionType.CASH_BOX_TOPUP);
  }

  async getUserBusinessPullSum(userId: Types.ObjectId): Promise<number> {
    const [result] = await this.pullTransactionModel.aggregate([
      {
        $match: {
          type: PullTransactionType.BUSINESS,
        },
      },
      {
        $lookup: {
          from: 'transactions',
          localField: 'origin',
          foreignField: '_id',
          as: 'originTx',
        },
      },
      {
        $unwind: '$originTx',
      },
      {
        $match: {
          'originTx.user': userId,
        },
      },
      {
        $group: {
          _id: null,
          totalSum: { $sum: '$price' },
        },
      },
    ]);

    return result?.totalSum ?? 0;
  }

  async getUserReferralSum(userId: Types.ObjectId): Promise<number> {
    return this.getUserPriceSum(userId, PullTransactionType.REFERRAL);
  }

  async calculateCashboxPullTransactionsSum(): Promise<number> {
    const pullTransactions = await this.findPullTransactionsByTypeForLast3Hours(
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

  private async getUserPriceSum(
    userId: Types.ObjectId,
    transactionType: PullTransactionType,
  ) {
    const result = await this.pullTransactionModel.aggregate([
      {
        $match: {
          receiver: userId,
          type: transactionType,
        },
      },
      {
        $group: {
          _id: null,
          totalPrice: { $sum: '$price' },
        },
      },
    ]);

    return result.length ? result[0].totalPrice : 0;
  }
}
