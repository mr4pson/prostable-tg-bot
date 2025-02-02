import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schemas';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

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
    return this.userModel.findOne({ publicKey }).exec();
  }

  async updateUser(
    tgUserId: number,
    updateData: Partial<User>,
  ): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate({ tgUserId }, { $set: updateData }, { new: true })
      .exec();
  }
}
