import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas';
import {
  BlockchainService,
  TelegramService,
  TransactionListener,
  UserService,
} from './services';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI ?? ''),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [
    UserService,
    TelegramService,
    BlockchainService,
    TransactionListener,
  ],
})
export class AppModule {}
