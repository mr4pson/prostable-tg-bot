import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument } from '../schemas';
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
    return this.getTransactionsSum(userId, TransactionType.INVEST);
  }

  async getUserReInvestSum(userId: Types.ObjectId): Promise<number> {
    return this.getTransactionsSum(userId, TransactionType.REINVEST);
  }

  async getUserSwapSum(userId: Types.ObjectId): Promise<number> {
    return this.getTransactionsSum(userId, TransactionType.SWAP);
  }

  async getUserWithdrawSum(userId: Types.ObjectId): Promise<number> {
    return this.getTransactionsSum(userId, [
      TransactionType.MANUAL_WITHDRAW,
      TransactionType.AUTO_WITHDRAW,
    ]);
  }

  async getActiveUserIds() {
    return this.transactionModel.distinct('user', {
      type: TransactionType.INVEST,
    });
  }

  async create(
    payload: Partial<Transaction>,
  ): Promise<TransactionDocument | null> {
    try {
      return this.transactionModel.create(payload);
    } catch (error) {
      console.log(error);

      return null;
    }
  }

  private async getTransactionsSum(
    userId: Types.ObjectId,
    transactionType: TransactionType | Array<TransactionType>,
  ) {
    const result = await this.transactionModel.aggregate([
      {
        $match: {
          user: userId,
          type: Array.isArray(transactionType)
            ? { $in: transactionType }
            : transactionType,
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
