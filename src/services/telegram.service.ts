import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  calculateEmissionMultiplier,
  CurrencyType,
  formatNumber,
  PullTransactionType,
  roundDecimals,
  TransactionType,
} from 'src/common';
import { Markup, Telegraf } from 'telegraf';
import { BlockchainService } from './blockchain.service';
import { MoralisService } from './moralis.service';
import { PullTransactionService } from './pull-transaction.service';
import { TgMenuService } from './tg-menu.service';
import { TransactionService } from './transaction.service';
import { UserService } from './user.service';
import { TransactionDocument, User, UserDocument } from 'src/schemas';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class TelegramService {
  private bot: Telegraf<any>;
  // private userStates = new Map();
  // private userDataMap = new Map();

  constructor(
    private userService: UserService,
    private blockchainService: BlockchainService,
    private tgMenuService: TgMenuService,
    private moralisService: MoralisService,
    private transactionService: TransactionService,
    private pullTransactionService: PullTransactionService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? '');
    this.setupHandlers();
    this.bot.launch();
  }

  private setupHandlers() {
    // Обработка старта
    this.bot.start(async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      await this.cacheManager.del(`user-state:${ctx.from.id}`);
      await this.cacheManager.del(`user-data-map:${ctx.from.id}`);
      // this.userStates.delete(ctx.from.id); // Reset state
      // this.userDataMap.delete(ctx.from.id);

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
      const userState = await this.cacheManager.get(`user-state:${tgUserId}`);

      if (userState === 'registration') {
        await this.handleRegistration(ctx);
        await this.cacheManager.get(`user-state:${tgUserId}`);

        return;
      }

      if (userState === 'send_usdt_username_input') {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const username = ctx.message.text.replace('@', '');
        const receiver = await this.userService.findUserByUsername(username);

        if (!receiver) {
          ctx.reply('Пользователь не существует');

          return;
        }

        ctx.replyWithMarkdown(`
*Ваш баланс USDT: ${Math.floor(user.walletBalance)}*,
Укажите количество USDT,
которое вы хотите отправить пользователю *@${username}*
        `);

        await this.cacheManager.set(
          `user-state:${tgUserId}`,
          'send_usdt_amount_input',
        );
        await this.cacheManager.set(`user-data-map:${tgUserId}`, {
          username,
        });
      }

      const amount = Number(ctx.message.text);

      if (userState === 'send_usdt_amount_input' && Number.isInteger(amount)) {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const userData: any = await this.cacheManager.get(
          `user-data-map:${tgUserId}`,
        );

        if (amount < 1) {
          ctx.reply('Введите сумму не менее 1 USDT.');

          return;
        }

        if (user.walletBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.reply(
          `Пожалуйста подтвердите транзакцию отправки ${Math.floor(amount)} USDT пользователю @${userData.username}`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_send_usdt'),
            Markup.button.callback('Отказаться', 'decline_send_usdt'),
          ]),
        );

        await this.cacheManager.set(`user-data-map:${tgUserId}`, {
          ...userData,
          amount,
        });
      }

      if (userState === 'invest' && Number.isInteger(amount)) {
        const user = await this.userService.findUserByTgId(ctx.from.id);
        const techUser = await this.userService.findUserByTgId(
          Number(process.env.TECH_ACC_TG_ID),
        );

        if (amount < 100) {
          ctx.reply('Введенное количество меньше 100 USDT.');

          return;
        }

        if (user.walletBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.replyWithMarkdown(
          `Пожалуйста подтвердите что вы покупаете токен *ROST* на *${Math.floor(amount)} USDT* , курс *1 ROST = ${Math.floor(calculateEmissionMultiplier(techUser.rostBalance))} USDT*. Вы получите *${Math.floor(amount)} ROST* и запустите транзакцию инвестирования.`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_invest'),
            Markup.button.callback('Отказаться', 'decline_invest'),
          ]),
        );

        // this.userStates.set(tgUserId, amount);
        await this.cacheManager.set(`user-state:${tgUserId}`, amount);
      }

      if (userState === 'reinvest' && Number.isInteger(amount)) {
        const user = await this.userService.findUserByTgId(ctx.from.id);

        if (amount < 100) {
          ctx.reply('Введенное количество меньше 100 ROST.');

          return;
        }

        if (user.rostBalance < amount) {
          ctx.reply('Недостаточно средств на балансе.');

          return;
        }

        ctx.replyWithMarkdown(
          `Пожалуйста подтвердите что вы запускаете транзакцию реинвестирования на *${Math.floor(amount)} ROST*`,
          Markup.inlineKeyboard([
            Markup.button.callback('Подтвердить', 'accept_reinvest'),
            Markup.button.callback('Отказаться', 'decline_reinvest'),
          ]),
        );

        // this.userDataMap.set(tgUserId, { amount });
        await this.cacheManager.set(`user-data-map:${tgUserId}`, { amount });
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
      await this.tgMenuService.setupROSTBalanceMenu(ctx);
    });
    this.bot.hears('Баланс выплат', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      await this.tgMenuService.setupPaymentsBalanceMenu(ctx, user);
    });
    this.bot.hears('Поддержка', async (ctx) => {
      ctx.replyWithMarkdown(`
*По всем вопросам в рамках проекта с нами можно связаться через телеграм*

@ProStabletex
      `);
    });
    this.bot.hears('F.A.Q', (ctx) => {
      ctx.reply('Раздел на доработке.');
    });
    this.bot.hears('Реферальная система', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      const referralsInfo = await this.userService.getReferralCounts(tgUserId);
      const firstLineActiveReferrals =
        await this.userService.getFirstLineActiveReferralsCount(tgUserId);

      this.tgMenuService.setupReferralsMenu(
        ctx,
        user,
        referralsInfo,
        firstLineActiveReferrals,
      );
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
    this.bot.hears('Отправить USDT пользователю', async (ctx) => {
      ctx.reply(`Для внутреннего перевода USDT укажите логин телеграмма зарегистрированного пользователя бота ProStable.
Пример: @ProStable`);

      await this.cacheManager.set(
        `user-state:${ctx.from.id}`,
        'send_usdt_username_input',
      );
    });
    this.bot.hears('Инвестировать', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      if (ctx.from.id === Number(process.env.TECH_ACC_TG_ID)) {
        ctx.replyWithMarkdown(
          'Невозможно инвестировать с технического аккаунта.',
        );

        return;
      }

      ctx.replyWithMarkdown(
        `Ваш баланс *${Math.floor(user.walletBalance)} USDT* , пожалуйста отправьте мне количество *USDT* на которое вы хотите купить токен *ROST*.

Минимальная транзакция *100 USDT*.
Ваши средства будут распределены:

*50%* - будут сохранены в токенах ROST в ПУЛ БИЗНЕС и будут приумножены Вам назад в 5-ти кратном размере в течение года после запуска ЦОД ориентировочная дата 02.2026 года

*40%* - будут сохранены  в токенах ROST в ПУЛ КАССА и затем будут распределены в равных долях между всеми участниками проекта раз в сутки

*10%* - распределяются по реферальной системе
      `,
      );

      await this.cacheManager.set(`user-state:${ctx.from.id}`, 'invest');
    });

    // Обработка принятия условий ивестирования
    this.bot.action('accept_invest', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      const techUser = await this.userService.findUserByTgId(
        Number(process.env.TECH_ACC_TG_ID),
      );
      // const amount = this.userStates.get(tgUserId);
      const amount: number = await this.cacheManager.get(
        `user-state:${ctx.from.id}`,
      );

      if (typeof amount === 'undefined') {
        ctx.reply('Произошла ошибка. Повторите снова.');

        return;
      }

      const trx = await this.blockchainService.handleDeposit(
        user.privateKey,
        Number(amount),
      );

      if (!trx) {
        await ctx.replyWithMarkdown(
          'Транзакция завершена с ошибкой. Обратитесь к администратору.',
          Markup.keyboard(['Баланс ROST']).resize(),
        );
        console.log('Deposit failed');

        return;
      }

      const transaction = await this.transactionService.create({
        user: new Types.ObjectId(user._id as string),
        type: TransactionType.INVEST,
        price: amount,
        currencyType: CurrencyType.USDT,
      });

      if (!transaction) {
        await ctx.replyWithMarkdown(
          'Транзакция завершена с ошибкой. Обратитесь к администратору.',
          Markup.keyboard(['Баланс ROST']).resize(),
        );
        console.log('Deposit Mongo Transaction Creation failed');

        return;
      }

      const businessPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.BUSINESS,
        price: roundDecimals(
          amount / calculateEmissionMultiplier(techUser.rostBalance) / 2,
        ),
        currencyType: CurrencyType.ROST,
      });
      const cashboxPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.CASH_BOX,
        price: roundDecimals(
          (amount / calculateEmissionMultiplier(techUser.rostBalance)) * 0.4,
        ),
        currencyType: CurrencyType.ROST,
      });

      await this.sendReferralTransactions(techUser, user, amount, transaction);
      await this.userService.updateUser(tgUserId, {
        walletBalance: user.walletBalance - amount,
      });
      await this.userService.updateUser(Number(process.env.TECH_ACC_TG_ID), {
        rostBalance: roundDecimals(
          techUser.rostBalance -
            amount / calculateEmissionMultiplier(techUser.rostBalance),
        ),
      });
      console.log(trx);

      await ctx.replyWithMarkdown(
        'Транзакция завершена успешно, ваш *ROST* зачислен на *Баланс ROST* и запущена транзакция инвестирования',
        Markup.keyboard(['Баланс ROST']).resize(),
      );

      await this.cacheManager.del(`user-state:${ctx.from.id}`);
      await this.tgMenuService.setupMainMenu(ctx);
    });

    // Обработка отклонения условий ивестирования
    this.bot.action('decline_invest', async (ctx) => {
      await ctx.reply(
        'Транзакция покупки ROST отклонена, если захотите повторно запустить транзакцию инвестирования то нажмите на кнопку "Инвестировать"',
      );

      await this.cacheManager.del(`user-state:${ctx.from.id}`);
      await this.tgMenuService.setupMainMenu(ctx);
    });

    // Обработка принятия условий отправки USDT
    this.bot.action('accept_send_usdt', async (ctx) => {
      const tgUserId = ctx.from.id;
      const user = await this.userService.findUserByTgId(tgUserId);
      // const userData = this.userDataMap.get(tgUserId);
      const userData: any = await this.cacheManager.get(
        `user-data-map:${ctx.from.id}`,
      );
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

      await this.cacheManager.del(`user-state:${tgUserId}`);
      await this.cacheManager.del(`user-data-map:${tgUserId}`);
    });

    // Обработка отклонения условий отправки USDT
    this.bot.action('decline_send_usdt', async (ctx) => {
      await this.cacheManager.del(`user-state:${ctx.from.id}`);
      await this.cacheManager.del(`user-data-map:${ctx.from.id}`);

      await this.tgMenuService.setupMainMenu(ctx);
    });
  }

  private async sendReferralTransactions(
    techUser: UserDocument,
    user: UserDocument,
    amount: number,
    transaction: TransactionDocument,
  ) {
    const referralValue = roundDecimals(
      (amount / calculateEmissionMultiplier(techUser.rostBalance)) * 0.1,
    );
    const firstLvlvreferrer = await this.userService.findUserById(
      user.referrer,
    );
    const secondLlvReferrer = await this.userService.findUserById(
      firstLvlvreferrer?.referrer,
    );
    const thirdLlvReferrer = await this.userService.findUserById(
      secondLlvReferrer?.referrer,
    );

    if (
      firstLvlvreferrer &&
      firstLvlvreferrer.tgUserId === Number(process.env.TECH_ACC_TG_ID)
    ) {
      const curReferralValue = referralValue;
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        origin: transaction._id,
        receiver: new Types.ObjectId(firstLvlvreferrer._id as string),
        price: curReferralValue,
        currencyType: CurrencyType.ROST,
      });

      await this.userService.updateUser(firstLvlvreferrer.tgUserId, {
        rostBalance: firstLvlvreferrer.rostBalance + curReferralValue,
      });

      return;
    } else {
      const curReferralValue = roundDecimals(referralValue * 0.7);
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        origin: transaction._id,
        receiver: new Types.ObjectId(firstLvlvreferrer._id as string),
        price: curReferralValue,
        currencyType: CurrencyType.ROST,
      });

      await this.userService.updateUser(firstLvlvreferrer.tgUserId, {
        rostBalance: firstLvlvreferrer.rostBalance + curReferralValue,
      });
    }

    if (
      secondLlvReferrer &&
      secondLlvReferrer.tgUserId === Number(process.env.TECH_ACC_TG_ID)
    ) {
      const curReferralValue = roundDecimals(referralValue * 0.3);
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        origin: new Types.ObjectId(transaction._id),
        receiver: new Types.ObjectId(secondLlvReferrer._id as string),
        price: curReferralValue,
        currencyType: CurrencyType.ROST,
      });

      await this.userService.updateUser(secondLlvReferrer.tgUserId, {
        rostBalance: secondLlvReferrer.rostBalance + curReferralValue,
      });

      return;
    } else {
      const curReferralValue = roundDecimals(referralValue * 0.2);
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        origin: new Types.ObjectId(transaction._id),
        receiver: new Types.ObjectId(secondLlvReferrer._id as string),
        price: curReferralValue,
        currencyType: CurrencyType.ROST,
      });

      await this.userService.updateUser(secondLlvReferrer.tgUserId, {
        rostBalance: secondLlvReferrer.rostBalance + curReferralValue,
      });
    }

    if (thirdLlvReferrer) {
      const curReferralValue = roundDecimals(referralValue * 0.1);
      const referralPullTransaction = await this.pullTransactionService.create({
        type: PullTransactionType.REFERRAL,
        origin: new Types.ObjectId(transaction._id),
        receiver: new Types.ObjectId(thirdLlvReferrer._id as string),
        price: curReferralValue,
        currencyType: CurrencyType.ROST,
      });

      await this.userService.updateUser(thirdLlvReferrer.tgUserId, {
        rostBalance: thirdLlvReferrer.rostBalance + curReferralValue,
      });
    }
  }

  private handlePaymentsBalanceButtons() {
    this.bot.hears('Реинвестировать', async (ctx) => {
      const user = await this.userService.findUserByTgId(ctx.from.id);

      ctx.reply(`
Ваш доступный баланс *${Math.floor(user.rostBalance)} ROST*, пожалуйста отправьте мне количество *ROST* которое вы хотите реинвестировать

Минимальная транзакция *100 ROST*.
Ваши средства будут распределены:

*50%* - будут сохранены в токенах ROST в ПУЛ БИЗНЕС и будут приумножены Вам назад в 5-ти кратном размере в течение года после запуска ЦОД ориентировочная дата 02.2026 года 

*40%* - будут сохранены  в токенах ROST в ПУЛ КАССА и затем будут распределены в равных долях между всеми участниками проекта раз в сутки 

*10%* - распределяются по реферальной системе
        `);

      await this.cacheManager.set(`user-state:${ctx.from.id}`, 'reinvest');
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
      const techUser = await this.userService.findUserByTgId(
        Number(process.env.TECH_ACC_TG_ID),
      );
      let user = await this.userService.findUserByTgId(tgUserId);
      const userDataMap = (await this.cacheManager.get(
        `user-data-map:${tgUserId}`,
      )) as any;

      if (!userDataMap) {
        ctx.reply('Ошибка при создании транзакции.');
        console.log('accept_reinvest userdata is undefined');

        return;
      }

      const transaction = await this.transactionService.create({
        user: new Types.ObjectId(user._id as string),
        type: TransactionType.REINVEST,
        price: userDataMap?.amount,
        currencyType: CurrencyType.ROST,
      });

      if (!transaction) {
        await ctx.replyWithMarkdown(
          'Транзакция отклонена',
          Markup.keyboard(['Баланс выплат']).resize(),
        );

        return;
      }

      const businessPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.BUSINESS,
        price: roundDecimals(
          userDataMap?.amount /
            calculateEmissionMultiplier(techUser.rostBalance) /
            2,
        ),
        currencyType: CurrencyType.ROST,
      });
      const cashboxPullTransaction = await this.pullTransactionService.create({
        origin: new Types.ObjectId(transaction._id),
        type: PullTransactionType.CASH_BOX,
        price: roundDecimals(
          (userDataMap?.amount /
            calculateEmissionMultiplier(techUser.rostBalance)) *
            0.4,
        ),
        currencyType: CurrencyType.ROST,
      });

      await this.sendReferralTransactions(
        techUser,
        user,
        userDataMap?.amount,
        transaction,
      );
      await this.userService.updateUser(tgUserId, {
        rostBalance: user.rostBalance - userDataMap?.amount,
      });

      await ctx.replyWithMarkdown(
        'Транзакция завершена успешно, ваш *ROST* зачислен на *Баланс ROST* и запущена транзакция реинвестирования',
        Markup.keyboard(['Баланс ROST']).resize(),
      );

      await this.cacheManager.del(`user-state:${tgUserId}`);
      await this.cacheManager.del(`user-data-map:${tgUserId}`);

      await this.tgMenuService.setupPaymentsBalanceMenu(ctx, user);
    });

    // Обработка отклонения условий ивестирования
    this.bot.action('decline_reinvest', async (ctx) => {
      await ctx.reply(
        'Транзакция покупки ROST отклонена, если захотите повторно запустить транзакцию инвестирования то нажмите на кнопку "Инвестировать"',
      );

      await this.cacheManager.del(`user-state:${ctx.from.id}`);

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

      await this.cacheManager.set(`user-state:${tgUserId}`, 'registration');
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

До следуюего повышения курса осталось выкупить: ${formatNumber(Math.floor(nextRateRaseNumber))} ROST

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
