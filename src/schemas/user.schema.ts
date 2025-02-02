import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  tgUserId: number;

  @Prop()
  username?: string;

  @Prop({ type: 'ObjectId', ref: 'User' })
  referrer?: User;

  @Prop()
  privateKeyHash: string;

  @Prop()
  publicKey: string;

  @Prop()
  email?: string;

  @Prop({ default: false })
  acceptedTerms: boolean;

  @Prop({ default: 0 })
  walletBalance: number;

  @Prop({ default: false })
  hasFundedWallet: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
