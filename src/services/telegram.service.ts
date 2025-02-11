import { Injectable } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { BlockchainService } from './blockchain.service';
import { TgMenuService } from './tg-menu.service';
import { UserService } from './user.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf;

  constructor(
    private userService: UserService,
    private blockchainService: BlockchainService,
    private tgMenuService: TgMenuService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? '');
    this.setupHandlers();
    this.bot.launch();
  }

  private setupHandlers() {
    // Обработка старта
    this.bot.start(async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      if (user && user.publicKey) {
        this.tgMenuService.setupMainMenu(ctx);

        return;
      }

      // const referrerId = ctx.startPayload;
      const referrerId = undefined;

      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        username: ctx.from.username,
        referrer: referrerId,
      });

      await ctx.replyWithMarkdown(
        'Для использования бота необходимо принять условия обслуживания:',
        Markup.inlineKeyboard([
          Markup.button.callback('✅ Принимаю', 'accept_terms'),
          Markup.button.callback('❌ Отказываюсь', 'decline_terms'),
        ]),
      );
    });

    this.bot.hears('Баланс пополнения', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      this.tgMenuService.setupBalanceTopupMenu(ctx, user.walletBalance);
    });

    // Обработка главного меню
    this.bot.hears('Баланс ROST', (ctx) => {
      ctx.reply('You selected Option 2');
    });
    this.bot.hears('Баланс выплат', (ctx) => {
      ctx.reply('You selected Option 3');
    });
    this.bot.hears('Поддержка', (ctx) => {
      ctx.reply('You selected Option 1');
    });
    this.bot.hears('F.A.Q', (ctx) => {
      ctx.reply('You selected Option 2');
    });
    this.bot.hears('Реферальная система', (ctx) => {
      ctx.reply('You selected Option 3');
    });

    // Обработка меню Баланс пополнения
    this.bot.hears('Пополнить USDT', (ctx) => {});
    this.bot.hears('Отправить USDT', (ctx) => {
      ctx.reply('You selected Option 3');
    });
    this.bot.hears('Инвестировать', (ctx) => {
      ctx.reply('You selected Option 1');
    });
    this.bot.hears('Главное меню', (ctx) => {
      this.tgMenuService.setupMainMenu(ctx);
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

      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        privateKey: wallet.privateKey,
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
        await ctx.reply(
          'Отлично! Регистрация завершена, теперь вы можете пользоваться личным кабинетом SMART INVEST',
        );
        await this.tgMenuService.setupMainMenu(ctx);
      }
    });
  }
}
