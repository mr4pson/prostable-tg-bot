import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';
import { CurrencyType, PullTransactionType } from 'src/common';

export interface IPullTransaction {
  type: PullTransactionType;
  price: number;
  receiver?: Types.ObjectId;
  origin?: Types.ObjectId;
  currencyType: CurrencyType;
  createdAt: Date;
}

@Schema()
export class PullTransaction implements IPullTransaction {
  @ApiProperty({
    description: 'Транзакция происхождения',
    type: String,
    example: '60d5ec49f1d3c72f9c8b4567',
    required: false,
  })
  @Prop({
    type: Types.ObjectId,
    ref: 'Transaction',
    required: false,
  })
  origin: Types.ObjectId;

  @ApiProperty({
    description: 'ID пользователя',
    type: String,
    example: '60d5ec49f1d3c72f9c8b4567',
    required: false,
  })
  @Prop({ type: Types.ObjectId, required: false, ref: 'User' })
  receiver: Types.ObjectId;

  @ApiProperty({
    description: 'Тип транзакции',
    enum: PullTransactionType,
    example: PullTransactionType.BUSINESS,
  })
  @Prop({
    type: String,
    enum: PullTransactionType,
    required: true,
  })
  type: PullTransactionType;

  @ApiProperty({
    description: 'Стоимость транзакции',
    type: Number,
    example: 100,
  })
  @Prop({
    type: Number,
    required: true,
  })
  price: number;

  @ApiProperty({
    description: 'Тип валюты',
    enum: CurrencyType,
    example: CurrencyType.ROST,
  })
  @Prop({
    type: String,
    required: true,
    enum: CurrencyType,
  })
  currencyType: CurrencyType;

  @ApiProperty({
    description: 'Время создания транзакции',
    type: Date,
    example: '2025-01-01T00:00:00.000Z',
  })
  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export type PullTransactionDocument = HydratedDocument<PullTransaction>;

export const PullTransactionSchema =
  SchemaFactory.createForClass(PullTransaction);
