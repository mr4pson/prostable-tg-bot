import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  async findAllUserPullTransactions(
    userId: Types.ObjectId,
  ): Promise<PullTransaction[]> {
    return this.pullTransactionModel.find({
      receiver: userId,
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
      // Шаг 1. Фильтруем PullTransaction, чтобы брать только PULL_BUSINESS
      {
        $match: {
          type: PullTransactionType.BUSINESS,
        },
      },
      // Шаг 2. Делаем lookup на "transactions", чтобы подцепить данные origin
      {
        $lookup: {
          from: 'transactions', // имя коллекции Transaction в Mongo
          localField: 'origin', // поле в PullTransaction
          foreignField: '_id', // поле в Transaction
          as: 'originTx', // как назовем поле после lookup
        },
      },
      // Шаг 3. "разворачиваем" массив originTx (т.к. $lookup создает массив)
      {
        $unwind: '$originTx',
      },
      // Шаг 4. Фильтруем по тому, что originTx.user = userId, и originTx.type = INVEST
      {
        $match: {
          'originTx.user': userId,
        },
      },
      // Шаг 5. Группируем (нам нужна только сумма pullTransaction.price)
      {
        $group: {
          _id: null,
          totalSum: { $sum: '$price' },
        },
      },
    ]);

    // Если ничего не нашлось, result будет undefined
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
