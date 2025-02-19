import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Model,
  RootFilterQuery,
  UpdateQuery,
  UpdateWithAggregationPipeline,
} from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schemas';
import { IReferralsInfo } from 'src/common';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async findAllUsers(): Promise<User[]> {
    return this.userModel.find();
  }

  async getUsersCount(): Promise<number> {
    // Including tech user
    const totalUsersCount = await this.userModel.countDocuments();

    return totalUsersCount - 1;
  }

  async findUserByTgId(tgUserId: number): Promise<User> {
    return this.userModel.findOne({ tgUserId: tgUserId });
  }

  async findUserByUsername(username: string): Promise<User> {
    return this.userModel.findOne({ username: username });
  }

  async updateMany(
    filter: RootFilterQuery<User>,
    query: UpdateQuery<User> | UpdateWithAggregationPipeline,
  ) {
    return this.userModel.updateMany(filter, query);
  }

  async createOrUpdateUser(data: Partial<User>) {
    return this.userModel.findOneAndUpdate({ tgUserId: data.tgUserId }, data, {
      upsert: true,
      new: true,
    });
  }

  async hashPrivateKey(privateKey: string): Promise<string> {
    return bcrypt.hash(privateKey, 10);
  }

  async updateEmail(tgUserId: number, email: string) {
    return this.userModel.findOneAndUpdate(
      { tgUserId },
      { email },
      { new: true },
    );
  }

  async findByPublicKey(publicKey: string): Promise<User | null> {
    return this.userModel
      .findOne({
        $expr: {
          $eq: [
            {
              $toLower: '$publicKey',
            },
            publicKey.toLowerCase(),
          ],
        },
      })
      .exec();
  }

  async updateUser(
    tgUserId: number,
    updateData: Partial<User>,
  ): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate({ tgUserId }, { $set: updateData }, { new: true })
      .exec();
  }

  public async getRostHoldersNumber(): Promise<number> {
    const holdersNumber = await this.userModel.countDocuments({
      rostBalance: { $gt: 0 },
    });

    return holdersNumber - 1;
  }

  public async getNextRateRaseNumber(): Promise<number> {
    const techUser = await this.userModel.findOne({
      tgUserId: process.env.TECH_ACC_TG_ID,
    });

    return techUser.rostBalance % 50_000
      ? techUser.rostBalance % 50_000
      : 50_000;
  }

  /**
   * Получить количество рефералов 1-го, 2-го и 3-го уровня для пользователя с заданным tgUserId.
   */
  public async getReferralCounts(tgUserId: number): Promise<IReferralsInfo> {
    const user = await this.userModel.findOne({ tgUserId }).exec();

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const userId = user._id;

    // ----- Уровень 1 -----
    // Все пользователи, у которых "referrer" == userId
    const level1Users = await this.userModel
      .find({ referrer: userId }, { _id: 1 })
      .exec();
    const level1Count = level1Users.length;

    // ----- Уровень 2 -----
    // Все пользователи, у которых "referrer" входит в список level1Users
    const level1Ids = level1Users.map((u) => u._id);
    const level2Users = await this.userModel
      .find({ referrer: { $in: level1Ids } }, { _id: 1 })
      .exec();
    const level2Count = level2Users.length;

    // ----- Уровень 3 -----
    // Все пользователи, у которых "referrer" входит в список level2Users
    const level2Ids = level2Users.map((u) => u._id);
    const level3Users = await this.userModel
      .find({ referrer: { $in: level2Ids } }, { _id: 1 })
      .exec();
    const level3Count = level3Users.length;

    return {
      level1: level1Count,
      level2: level2Count,
      level3: level3Count,
    };
  }
}
