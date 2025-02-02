import { Injectable } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { UserService } from './user.service';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf;

  constructor(
    private userService: UserService,
    private blockchainService: BlockchainService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? '');
    this.setupHandlers();
    this.bot.launch();
  }

  private setupHandlers() {
    // Обработка старта
    this.bot.start(async (ctx) => {
      const referrerId = ctx.startPayload;
      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        username: ctx.from.username,
        referrer: referrerId as any,
      });

      await ctx.replyWithMarkdown(
        'Для использования бота необходимо принять условия обслуживания:',
        Markup.inlineKeyboard([
          Markup.button.callback('✅ Принимаю', 'accept_terms'),
          Markup.button.callback('❌ Отказываюсь', 'decline_terms'),
        ]),
      );
    });

    // Обработка принятия условий
    this.bot.action('accept_terms', async (ctx) => {
      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        acceptedTerms: true,
      });

      await ctx.reply(
        'Для продолжения нажмите кнопку:',
        Markup.keyboard(['Продолжить ▶️']).resize(),
      );
    });

    // Обработка кнопки "Продолжить"
    this.bot.hears('Продолжить ▶️', async (ctx) => {
      const wallet = this.blockchainService.generateWallet();
      const hashedKey = await this.userService.hashPrivateKey(
        wallet.privateKey,
      );

      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        privateKeyHash: hashedKey,
        publicKey: wallet.publicKey,
      });

      await ctx.reply(`Ваш адрес кошелька:\n\`${wallet.publicKey}\``, {
        parse_mode: 'Markdown',
      });
      await ctx.reply('Введите ваш email для завершения регистрации:');
    });

    // Обработка email
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.includes('@')) {
        await this.userService.updateEmail(ctx.from.id, ctx.message.text);
        await ctx.reply('Регистрация завершена!');
      }
    });
  }
}
