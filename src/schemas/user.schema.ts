import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

interface IUser {
  tgUserId: number;
  username?: string;
  referrer: Types.ObjectId;
  privateKey: string;
  publicKey: string;
  email?: string;
  acceptedTerms: boolean;
  walletBalance: number;
  rostBalance: number;
  hasFundedWallet: boolean;
}

@Schema({ timestamps: true })
export class User extends Document implements IUser {
  @Prop({ required: true, unique: true })
  tgUserId: number;

  @Prop()
  username?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  referrer: Types.ObjectId;

  @Prop()
  privateKey: string;

  @Prop()
  publicKey: string;

  @Prop()
  email?: string;

  @Prop({ default: false })
  acceptedTerms: boolean;

  @Prop({ default: 0 })
  walletBalance: number;

  @Prop({ default: 0 })
  rostBalance: number;

  @Prop({ default: false })
  hasFundedWallet: boolean;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ referrer: 1 });
