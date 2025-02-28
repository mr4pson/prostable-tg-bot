import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction } from '../schemas';
import { TransactionType } from 'src/common';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
  ) {}

  async findAllTransactions(): Promise<Transaction[]> {
    return this.transactionModel.find();
  }

  async getUserAllInvestSum(userId: Types.ObjectId): Promise<number> {
    const investSum = await this.getUserInvestSum(userId);
    const reinvestSum = await this.getUserReInvestSum(userId);

    return investSum + reinvestSum;
  }

  async getUserInvestSum(userId: Types.ObjectId): Promise<number> {
    return this.getUserPriceSum(userId, TransactionType.INVEST);
  }

  async getUserReInvestSum(userId: Types.ObjectId): Promise<number> {
    return this.getUserPriceSum(userId, TransactionType.REINVEST);
  }

  async getActiveUserIds() {
    return this.transactionModel.distinct('user', {
      type: TransactionType.INVEST,
    });
  }

  async create(payload: Partial<Transaction>) {
    try {
      return this.transactionModel.create(payload);
    } catch (error) {
      console.log(error);

      return false;
    }
  }

  private async getUserPriceSum(
    userId: Types.ObjectId,
    transactionType: TransactionType,
  ) {
    const result = await this.transactionModel.aggregate([
      {
        $match: {
          user: userId,
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
