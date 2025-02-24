import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  calculateEmissionMultiplier,
  CurrencyType,
  formatNumber,
  PullTransactionType,
  TransactionType,
} from 'src/common';
import { Markup, Telegraf } from 'telegraf';
import { BlockchainService } from './blockchain.service';
import { MoralisService } from './moralis.service';
import { PullTransactionService } from './pull-transaction.service';
import { TgMenuService } from './tg-menu.service';
import { TransactionService } from './transaction.service';
import { UserService } from './user.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf<any>;
  private userStates = new Map();
  private userDataMap = new Map();

  constructor(
    private userService: UserService,
    private blockchainService: BlockchainService,
    private tgMenuService: TgMenuService,
    private moralisService: MoralisService,
    private transactionService: TransactionService,
    private pullTransactionService: PullTransactionService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? '');
    this.setupHandlers();
    this.bot.launch();
  }

  private setupHandlers() {
    // Обработка старта
    this.bot.start(async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      this.userStates.delete(ctx.from.id); // Reset state
      this.userDataMap.delete(ctx.from.id);

      if (user && user.publicKey) {
        await this.tgMenuService.setupMainMenu(ctx);

        return;
      }

      const referrer = await this.userService.findUserByTgId(
        Number(ctx.payload),
      );

      if (referrer) {
        await this.userService.createOrUpdateUser({
          tgUserId: ctx.from.id,
          username: ctx.from.username,
          referrer: new Types.ObjectId(referrer.id),
        });

        ctx.replyWithMarkdown(
          `*👋 Добро пожаловать в ProStable!
  
  Для использования полноценного функционала телеграм бота вам требуется согласиться с пользовательским соглашением
  
  https://docs.google.com/document/d/1fIFLBVIdLpM6TPeQg8SaA_ITBGtMERmRQ_u3wC-HIIE/edit?usp=drivesdk*`,
          Markup.inlineKeyboard([
            Markup.button.callback('Да, принять условия', 'accept_terms'),
            Markup.button.callback(
              'Нет, отказаться от условий',
              'decline_terms',
            ),
          ]),
        );

        return;
      }

      ctx.replyWithMarkdown(
        `*Регистрация в ProStable возможна только по реферальной ссылке, пожалуйста попросите ващего партнера выдать вам ссылку, иначе вы не сможете попасть в интерфейс.*`,
      );
    });

    this.handleMainMenuButtons();
    this.handleBalanceTopupButtons();
    this.handlePaymentsBalanceButtons();
    this.handleTextInput();
    this.handleRegistrationButtons();
  }

  private async handleTextInput() {
    this.bot.on('text', async (ctx) => {
      const tgUserId = ctx.from.id;

      if (this.userStates.get(tgUserId) === 'registration') {
        await this.handleRegistration(ctx);
        this.userStates.delete(tgUserId);

        return;
      }

      if (this.userStates.get(tgUserId) === 'send_usdt_username_input') {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const username = ctx.message.text.replace('@', '');
        const receiver = await this.userService.findUserByUsername(username);

        if (!receiver) {
          ctx.reply('Пользователь не существует');

          return;
        }

        ctx.replyWithMarkdown(`
*Ваш баланс USDT: ${user.walletBalance}*,
Укажите количество USDT,
которое вы хотите отправить пользователю *@${username}*
        `);

        this.userStates.set(tgUserId, 'send_usdt_amount_input');
        this.userDataMap.set(tgUserId, {
          username,
        });
      }

      const amount = Number(ctx.message.text);

      if (
        this.userStates.get(tgUserId) === 'send_usdt_amount_input' &&
        Number.isInteger(amount)
      ) {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const userData = this.userDataMap.get(tgUserId);

        if (user.walletBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.reply(
          `Пожалуйста подтвердите транзакцию отправки ${amount} USDT пользователю @${userData.username}`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_send_usdt'),
            Markup.button.callback('Отказаться', 'decline_send_usdt'),
          ]),
        );

        this.userDataMap.set(tgUserId, {
          ...userData,
          amount,
        });
      }

      if (
        this.userStates.get(tgUserId) === 'invest' &&
        Number.isInteger(amount)
      ) {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const techUser = await this.userService.findUserByTgId(
          Number(process.env.TECH_ACC_TG_ID),
        );

        // if (amount < 100) {
        //   ctx.reply('Введенное количество меньше 100 USDT.');

        //   return;
        // }

        if (user.walletBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.replyWithMarkdown(
          `Пожалуйста подтвердите что вы покупаете токен *ROST* на *${amount} USDT* , курс *1 ROST = ${calculateEmissionMultiplier(techUser.rostBalance)} USDT*. Вы получите *${amount} ROST* и запустите транзакцию инвестирования.`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_invest'),
            Markup.button.callback('Отказаться', 'decline_invest'),
          ]),
        );

        this.userStates.set(tgUserId, amount);
      }

      if (
        this.userStates.get(tgUserId) === 'reinvest' &&
        Number.isInteger(amount)
      ) {
        const user = await this.userService.findUserByTgId(ctx.from.id);

        // if (amount < 100) {
        //   ctx.reply('Введенное количество меньше 100 ROST.');

        //   return;
        // }

        if (user.rostBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.replyWithMarkdown(
          `Пожалуйста подтвердите что вы запускаете транзакцию реинвестирования на *${amount} ROST*`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_reinvest'),
            Markup.button.callback('Отказаться', 'decline_reinvest'),
          ]),
        );

        this.userDataMap.set(tgUserId, { amount });
      }
    });
  }

  private async handleRegistration(ctx) {
    if (ctx.message.text.includes('@')) {
      await this.userService.updateEmail(ctx.from.id, ctx.message.text);
      await ctx.replyWithMarkdown(
        `Отлично! Теперь вам нужно обязательно подписаться на канал, чтобы продолжить: https://t.me/+6hsWt7xrH5w0ZTY6`,
        Markup.inlineKeyboard([
          Markup.button.callback('Продолжить', 'check_subscription'),
        ]),
      );
    }
  }

  private handleMainMenuButtons() {
    this.bot.hears('Главное меню', async (ctx) => {
      await this.tgMenuService.setupMainMenu(ctx);
    });

    this.bot.hears('Баланс пополнения', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      this.tgMenuService.setupBalanceTopupMenu(ctx, user?.walletBalance);
    });

    // Обработка главного меню
    this.bot.hears('Баланс ROST', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      this.tgMenuService.setupROSTBalanceMenu(ctx, user?.rostBalance);
    });
    this.bot.hears('Баланс выплат', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      await this.tgMenuService.setupPaymentsBalanceMenu(ctx, user);
    });
    this.bot.hears('Поддержка', (ctx) => {
      ctx.reply('You selected Option 1');
    });
    this.bot.hears('F.A.Q', (ctx) => {
      ctx.reply('You selected Option 2');
    });
    this.bot.hears('Реферальная система', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      const referralsInfo = await this.userService.getReferralCounts(tgUserId);

      this.tgMenuService.setupReferralsMenu(ctx, user, referralsInfo);
    });
  }

  private handleBalanceTopupButtons() {
    // Обработка меню Баланс пополнения
    this.bot.hears('Пополнить USDT', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      ctx.reply(user.publicKey);
      ctx.reply(`
        Отправляйте на данный адрес кошелька USDT только на сети BNB Smart Chain (USDT bep20)
      `);
      await this.moralisService.addStream(
        user.publicKey,
        '/transactions/wallet-topup-webhook',
      );
    });
    this.bot.hears('Отправить USDT пользователю', (ctx) => {
      ctx.reply(`Для внутреннего перевода USDT укажите логин телеграмма зарегистрированного пользователя бота ProStable.
Пример: @ProStable`);

      this.userStates.set(ctx.from.id, 'send_usdt_username_input');
    });
    this.bot.hears('Инвестировать', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      ctx.replyWithMarkdown(
        `Ваш баланс *${user.walletBalance} USDT* , пожалуйста отправьте мне количество *USDT* на которое вы хотите купить токен *ROST*.

      Минимальная транзакция *100 USDT*.
      Ваши средства будут распределены:

      *50%* - будут сохранены в токенах ROST в ПУЛ БИЗНЕС и будут приумножены Вам назад в 5-ти кратном размере в течение года после запуска ЦОД ориентировочная дата 02.2026 года

      *40%* - будут сохранены  в токенах ROST в ПУЛ КАССА и затем будут распределены в равных долях между всеми участниками проекта раз в сутки

      *10%* - распределяются по реферальной системе
      `,
      );

      this.userStates.set(ctx.from.id, 'invest');
    });

    // Обработка принятия условий ивестирования
    this.bot.action('accept_invest', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      const techUser = await this.userService.findUserByTgId(
        Number(process.env.TECH_ACC_TG_ID),
      );
      const amount = this.userStates.get(tgUserId);

      const trx = await this.blockchainService.handleDeposit(
        user.privateKey,
        amount,
      );

      const transaction = await this.transactionService.create({
        user: new Types.ObjectId(user._id as string),
        type: TransactionType.INVEST,
        price: amount,
        currencyType: CurrencyType.USDT,
      });

      if (!trx || !transaction) {
        await ctx.replyWithMarkdown(
          'Транзакция отклонена',
          Markup.keyboard(['Баланс ROST']).resize(),
        );

        return;
      }

      const businessPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.BUSINESS,
        price: amount / calculateEmissionMultiplier(techUser.rostBalance) / 2,
        currencyType: CurrencyType.ROST,
      });

      const cashboxPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.CASH_BOX,
        price:
          (amount / calculateEmissionMultiplier(techUser.rostBalance)) * 0.4,
        currencyType: CurrencyType.ROST,
      });
      const referralValue =
        (amount / calculateEmissionMultiplier(techUser.rostBalance)) * 0.1;
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        price: referralValue,
        currencyType: CurrencyType.ROST,
      });

      const userReferrals = await this.userService.getUserReferrals(tgUserId);

      for (const [levelName, userIds] of Object.entries(userReferrals)) {
        for (const userId of userIds) {
          const curUser = await this.userService.findUserById(userId);
          const usersCount = userIds.length ?? 1;
          const curReferralValue =
            levelName === 'level1'
              ? (referralValue * 0.7) / usersCount
              : levelName === 'level2'
                ? (referralValue * 0.2) / usersCount
                : (referralValue * 0.1) / usersCount;

          await this.userService.updateUser(curUser.tgUserId, {
            rostBalance: curUser.rostBalance + curReferralValue,
          });
        }
      }

      await this.userService.updateUser(tgUserId, {
        rostBalance: user.rostBalance + amount,
        walletBalance: user.walletBalance - amount,
      });
      await this.userService.updateUser(Number(process.env.TECH_ACC_TG_ID), {
        rostBalance:
          techUser.rostBalance -
          amount / calculateEmissionMultiplier(techUser.rostBalance),
      });
      console.log(trx);

      await ctx.replyWithMarkdown(
        'Транзакция завершена успешно, ваш *ROST* зачислен на *Баланс ROST* и запущена транзакция инвестирования',
        Markup.keyboard(['Баланс ROST']).resize(),
      );

      this.userStates.delete(tgUserId);

      await this.tgMenuService.setupMainMenu(ctx);
    });

    // Обработка отклонения условий ивестирования
    this.bot.action('decline_invest', async (ctx) => {
      await ctx.reply(
        'Транзакция покупки ROST отклонена, если захотите повторно запустить транзакцию инвестирования то нажмите на кнопку "Инвестировать"',
      );

      this.userStates.delete(ctx.from.id);

      await this.tgMenuService.setupMainMenu(ctx);
    });

    // Обработка принятия условий отправки USDT
    this.bot.action('accept_send_usdt', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      const userData = this.userDataMap.get(tgUserId);
      const receiver = await this.userService.findUserByUsername(
        userData.username,
      );

      if (!receiver) {
        await ctx.replyWithMarkdown(
          `Транзакция отклонена.`,
          Markup.keyboard(['Баланс выплат']).resize(),
        );

        return;
      }

      await ctx.replyWithMarkdown(
        `Транзакция отправлена. Пожалуйста, ожидайте выполнения...`,
      );

      await this.moralisService.addStream(
        user.publicKey,
        '/transactions/usdt-transfer-webhook',
      );

      await this.blockchainService.handleSendTransfer(
        user.privateKey,
        receiver.publicKey,
        userData.amount,
      );

      this.userStates.delete(tgUserId);
      this.userDataMap.delete(tgUserId);
    });

    // Обработка отклонения условий отправки USDT
    this.bot.action('decline_send_usdt', async (ctx) => {
      this.userStates.delete(ctx.from.id);
      this.userDataMap.delete(ctx.from.id);

      await this.tgMenuService.setupMainMenu(ctx);
    });
  }

  private handlePaymentsBalanceButtons() {
    this.bot.hears('Реинвестировать', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      ctx.reply(`
Ваш доступный баланс *${user.rostBalance} ROST*, пожалуйста отправьте мне количество *ROST* которое вы хотите реинвестировать

Минимальная транзакция *100 ROST*.
Ваши средства будут распределены:

*50%* - будут сохранены в токенах ROST в ПУЛ БИЗНЕС и будут приумножены Вам назад в 5-ти кратном размере в течение года после запуска ЦОД ориентировочная дата 02.2026 года 

*40%* - будут сохранены  в токенах ROST в ПУЛ КАССА и затем будут распределены в равных долях между всеми участниками проекта раз в сутки 

*10%* - распределяются по реферальной системе
        `);

      this.userStates.set(ctx.from.id, 'reinvest');
    });
    this.bot.hears('Обмен ROST USDT', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);
    });
    this.bot.hears('Вывод USDT', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);
    });

    // Обработка принятия условий ивестирования
    this.bot.action('accept_reinvest', async (ctx) => {
      const tgUserId = ctx.from.id;
      let user = await this.userService.findUserByTgId(tgUserId);
      const { amount } = this.userDataMap.get(tgUserId);

      const transaction = await this.transactionService.create({
        user: new Types.ObjectId(user._id as string),
        type: TransactionType.REINVEST,
        price: amount,
        currencyType: CurrencyType.ROST,
      });

      if (!transaction) {
        await ctx.replyWithMarkdown(
          'Транзакция отклонена',
          Markup.keyboard(['Баланс выплат']).resize(),
        );

        return;
      }

      user = await this.userService.updateUser(tgUserId, {
        rostBalance: user.rostBalance - amount,
      });

      await ctx.replyWithMarkdown(
        'Транзакция завершена успешно, ваш *ROST* зачислен на *Баланс ROST* и запущена транзакция реинвестирования',
        Markup.keyboard(['Баланс ROST']).resize(),
      );

      this.userStates.delete(tgUserId);
      this.userDataMap.delete(tgUserId);

      await this.tgMenuService.setupPaymentsBalanceMenu(ctx, user);
    });

    // Обработка отклонения условий ивестирования
    this.bot.action('decline_reinvest', async (ctx) => {
      await ctx.reply(
        'Транзакция покупки ROST отклонена, если захотите повторно запустить транзакцию инвестирования то нажмите на кнопку "Инвестировать"',
      );

      this.userStates.delete(ctx.from.id);

      await this.tgMenuService.setupMainMenu(ctx);
    });
  }

  private handleRegistrationButtons() {
    // Обработка принятия условий
    this.bot.action('accept_terms', async (ctx) => {
      await this.userService.createOrUpdateUser({
        tgUserId: ctx.from.id,
        acceptedTerms: true,
      });

      await ctx.replyWithMarkdown(
        `Отлично! Сейчас мы создадим вам внутренний криптовалютный кошелек, он потребуется для взаимодействия смарт-контрактами и работы реферальной системы`,

        Markup.inlineKeyboard([
          Markup.button.callback('Продолжить', 'continue_registration'),
        ]),
      );
    });

    // Обработка кнопки "Продолжить"
    this.bot.action('continue_registration', async (ctx) => {
      const wallet = this.blockchainService.generateWallet();
      const tgUserId = ctx.from.id;

      await this.userService.createOrUpdateUser({
        tgUserId: tgUserId,
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
      });

      await ctx.reply(
        `Вам создан внутренний криптовалютный кошелек, кошелек подключен к блокчейну BNB Smart Chain (токены BEP20), адрес Вашего кошелька:`,
        {
          parse_mode: 'Markdown',
        },
      );
      await ctx.reply(`${wallet.publicKey}`, {
        parse_mode: 'Markdown',
      });
      await ctx.reply(
        'Теперь для завершения процесса регистрации пожалуйста введите ваш адрес e-mail',
      );

      this.userStates.set(tgUserId, 'registration');
    });

    this.bot.action('check_subscription', async (ctx) => {
      // const chatId = '-1002113804394';
      // const chatMember = await this.bot.telegram.getChatMember(
      //   chatId,
      //   ctx.from.id,
      // );

      // const isChatMember = ['member', 'administrator', 'creator'].includes(
      //   chatMember?.status,
      // );

      // if (!isChatMember) {
      // await ctx.replyWithMarkdown(
      //   `Отлично! Теперь вам нужно обязательно подписаться на канал, чтобы продолжить: https://t.me/+6hsWt7xrH5w0ZTY6`,
      //   Markup.inlineKeyboard([
      //     Markup.button.callback('Продолжить', 'check_subscription'),
      //   ]),
      // );

      // return;
      // }

      await ctx.replyWithMarkdown(
        `✅ Отлично! Добро пожаловать в главное меню! Для начала работы нажмите на кнопку
*"Баланс пополнения"*`,
      );

      await this.tgMenuService.setupMainMenu(ctx);
    });
  }

  public async setupMainMenuExternally(tgUserId: number) {
    const techUser = await this.userService.findUserByTgId(
      Number(process.env.TECH_ACC_TG_ID),
    );
    const rostHoldersNumber = await this.userService.getRostHoldersNumber();
    const nextRateRaseNumber = await this.userService.getNextRateRaseNumber();

    this.bot.telegram.sendMessage(
      tgUserId,
      `
💹 Курс: 1 ROST = ${calculateEmissionMultiplier(techUser.rostBalance)} USDT
  
Максимальная эмиссия: ${formatNumber(process.env.MAX_EMISSION_VALUE)} ROST

До следуюего повышения курса осталось выкупить: ${formatNumber(nextRateRaseNumber)} ROST

Сожжено: 0 ROST

Всего держателей ROST: *${rostHoldersNumber}*
        `,
      {
        reply_markup: {
          keyboard: [
            // Each inner array represents a row of buttons
            [
              { text: 'Баланс пополнения' },
              { text: 'Баланс ROST' },
              { text: 'Баланс выплат' },
            ],
            [
              { text: 'Поддержка' },
              { text: 'F.A.Q' },
              { text: 'Реферальная система' },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  public sendExternalBotMessage(tgUserId: number, message: string) {
    this.bot.telegram.sendMessage(tgUserId, message);
  }
}
