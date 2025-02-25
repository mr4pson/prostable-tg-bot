import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { Types } from 'mongoose';
import { CurrencyType, TransactionType } from 'src/common';
import {
  BlockchainService,
  TelegramService,
  TransactionService,
  UserService,
} from 'src/services';
import { MoralisService } from 'src/services/moralis.service';

@Controller('transactions')
export class TransactionController {
  private readonly logger = new Logger(TransactionController.name);

  constructor(
    private readonly userService: UserService,
    private readonly telegramService: TelegramService,
    private readonly moralisService: MoralisService,
    private readonly transactionService: TransactionService,
    private readonly blockchainService: BlockchainService,
  ) {}

  @Get('test')
  async test() {
    return { status: 'ok' };
  }

  @Post('wallet-topup-webhook')
  async handleWalletTopup(@Body() body: any) {
    const { confirmed, erc20Transfers, streamId } = body;
    const erc20Transfer = erc20Transfers.length ? erc20Transfers[0] : undefined;

    try {
      if (!confirmed || !erc20Transfers.length) {
        return { status: 'ok' };
      }

      const user = await this.userService.findByPublicKey(erc20Transfer?.to);

      if (erc20Transfer && user) {
        const walletBalance =
          user.walletBalance + Number(erc20Transfer.valueWithDecimals);

        await this.userService.updateUser(user.tgUserId, {
          walletBalance,
        });

        await this.blockchainService.sendBNB(erc20Transfer?.to);

        await this.telegramService.sendExternalBotMessage(
          user.tgUserId,
          `На ваш адрес "баланса пополнения" поступили ${Math.floor(erc20Transfer.valueWithDecimals)} USDT, хэш транзакции: https://bscscan.com/tx/${erc20Transfer.transactionHash}`,
        );

        await this.moralisService.removeStream(streamId);
      }
    } catch (error) {
      console.log(error);
    }

    return { status: 'ok' };
  }

  @Post('usdt-transfer-webhook')
  async handleUsdtTransfer(@Body() body: any) {
    const { confirmed, erc20Transfers, streamId } = body;
    const erc20Transfer = erc20Transfers.length ? erc20Transfers[0] : undefined;

    try {
      if (!confirmed || !erc20Transfers.length) {
        return { status: 'ok' };
      }

      const sender = await this.userService.findByPublicKey(
        erc20Transfer?.from,
      );
      const receiver = await this.userService.findByPublicKey(
        erc20Transfer?.to,
      );

      if (erc20Transfer && sender && receiver) {
        const amount = Number(erc20Transfer.valueWithDecimals);
        const senderWalletBalance = sender.walletBalance - amount;
        const receiverWalletBalance = receiver.walletBalance + amount;

        await this.userService.updateUser(sender.tgUserId, {
          walletBalance: senderWalletBalance,
        });
        await this.userService.updateUser(receiver.tgUserId, {
          walletBalance: receiverWalletBalance,
        });
        await this.transactionService.create({
          user: new Types.ObjectId(sender._id as string),
          receiver: new Types.ObjectId(receiver._id as string),
          type: TransactionType.TRANSFER,
          price: amount,
          currencyType: CurrencyType.USDT,
        });
        await this.telegramService.sendExternalBotMessage(
          sender.tgUserId,
          `Отлично, ${Math.floor(amount)} USDT отправлены пользователю @${receiver.username}`,
        );
        await this.telegramService.sendExternalBotMessage(
          receiver.tgUserId,
          `На ваш адрес "баланса пополнения" поступили *${Math.floor(amount)} USDT* от пользователя @${sender.username}`,
        );
        await this.moralisService.removeStream(streamId);
        await this.telegramService.setupMainMenuExternally(sender.tgUserId);
      }
    } catch (error) {
      console.log(error);
    }

    return { status: 'ok' };
  }
}
