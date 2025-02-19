import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';
import { CurrencyType, TransactionType } from 'src/common';

export interface ITransaction {
  user: Types.ObjectId;
  type: TransactionType;
  price: number;
  receiver?: Types.ObjectId;
  currencyType: CurrencyType;
  createdAt: Date;
}

@Schema()
export class Transaction implements ITransaction {
  @ApiProperty({
    description: 'ID пользователя',
    type: String,
    example: '60d5ec49f1d3c72f9c8b4567',
  })
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  user: Types.ObjectId;

  @ApiProperty({
    description: 'ID пользователя получателя',
    type: String,
    example: '60d5ec49f1d3c72f9c8b4567',
    required: false,
  })
  @Prop({ type: Types.ObjectId, required: false, ref: 'User' })
  receiver: Types.ObjectId;

  @ApiProperty({
    description: 'Тип транзакции',
    enum: TransactionType,
    example: TransactionType.REINVEST,
  })
  @Prop({
    type: String,
    enum: TransactionType,
    required: true,
  })
  type: TransactionType;

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

export type TransactionDocument = HydratedDocument<Transaction>;

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
