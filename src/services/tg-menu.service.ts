import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  calculateBusinessPullRate,
  calculateEmissionMultiplier,
  formatNumber,
  IReferralsInfo,
} from 'src/common';
import { User } from 'src/schemas';
import { Context } from 'telegraf';
import { PullTransactionService } from './pull-transaction.service';
import { TransactionService } from './transaction.service';
import { UserService } from './user.service';

@Injectable()
export class TgMenuService {
  constructor(
    private userService: UserService,
    private transactionService: TransactionService,
    private pullTransactionService: PullTransactionService,
  ) {}
  public async setupMainMenu(ctx: Context) {
    const techUser = await this.userService.findUserByTgId(
      Number(process.env.TECH_ACC_TG_ID),
    );
    const rostHoldersNumber = await this.userService.getRostHoldersNumber();
    const nextRateRaseNumber = await this.userService.getNextRateRaseNumber();

    ctx.replyWithMarkdown(
      `
💹 Курс: *1 ROST = ${calculateEmissionMultiplier(techUser.rostBalance)} USDT*

Максимальная эмиссия: *${formatNumber(process.env.MAX_EMISSION_VALUE)} ROST*

До следуюего повышения курса осталось выкупить: *${formatNumber(Math.floor(nextRateRaseNumber))} ROST*

Сожжено: *0 ROST*

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

  public setupBalanceTopupMenu(ctx: Context, walletBalance: number) {
    ctx.replyWithMarkdown(
      `Это меню раздела "Баланс пополнения", здесь вы можете пополнить свой аккаунт USDT, принять участие в инвестировании, а так же отправить USDT пользователю бота. Чтобы пополнить баланс нажмите на кнопку: *Пополнить USDT*

*Ваш баланс USDT: ${Math.floor(walletBalance)}*`,
      {
        reply_markup: {
          keyboard: [
            [
              { text: 'Пополнить USDT' },
              { text: 'Отправить USDT пользователю' },
              { text: 'Инвестировать' },
            ],
            [{ text: 'Главное меню' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  async setupROSTBalanceMenu(ctx: Context) {
    const user = await this.userService.findUserByTgId(ctx.from.id);
    const techUser = await this.userService.findUserByTgId(
      Number(process.env.TECH_ACC_TG_ID),
    );
    const groupVolume = await this.userService.getGroupVolume(ctx.from.id);
    const businessPullSum = Math.floor(
      await this.pullTransactionService.getUserBusinessPullSum(
        new Types.ObjectId(user?._id as string),
      ),
    );

    const emissionMultiplier = calculateEmissionMultiplier(
      techUser?.rostBalance,
    );
    const groupVolumeBonusRemainingValue = 50_000 - groupVolume;
    const businessPullRate = calculateBusinessPullRate(businessPullSum);
    const businessPullBonusRemaining = businessPullRate.limit - businessPullSum;

    ctx.replyWithMarkdown(
      `
*Личный объем:*

Накоплено в ПУЛ БИЗНЕС: *${Math.floor(businessPullSum)} ROST = ${Math.floor(businessPullSum * emissionMultiplier)} USDT*

Ваше вознаграждение составит *х${businessPullRate.rate} = ${Math.floor(businessPullSum * businessPullRate.rate)} USDT*

Для получения большего вознаграждения вам осталось накопить ещё ${Math.round(businessPullBonusRemaining)} USDT в Пуле Бизнес

*Групповой объем: ${Math.floor(groupVolume)} ROST = ${Math.floor(groupVolume * emissionMultiplier)} USDT*

Для получения Лидерского Бонуса 1 ВТС 
Вам осталось накопить ${groupVolumeBonusRemainingValue} USDT Группового объема
      `,
      {
        reply_markup: {
          keyboard: [[{ text: 'Главное меню' }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  public setupReferralsMenu(
    ctx: Context,
    user: User,
    referralsInfo: IReferralsInfo,
    firstLineActiveReferrals: number,
  ) {
    ctx.replyWithMarkdown(
      `
Ваша реферальная ссылка:

• https://t.me/prostablebot?start=${user.tgUserId}

Количество рефералов 1 уровня - *${referralsInfo.level1} человек*,
Количество рефералов 2 уровня - *${referralsInfo.level2} человек*,
Количество рефералов 3 уровня - *${referralsInfo.level3} человек*

Ваших активированных партнеров 
(те кто инвестировал не менее 100 USDT) 
в 1 линии - *${firstLineActiveReferrals} человек*
`,
      {
        reply_markup: {
          keyboard: [[{ text: 'Главное меню' }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  public async setupPaymentsBalanceMenu(ctx: Context, user: User) {
    const techUser = await this.userService.findUserByTgId(
      Number(process.env.TECH_ACC_TG_ID),
    );
    const emissionMultiplier = calculateEmissionMultiplier(
      techUser?.rostBalance,
    );
    const userInvestSum = await this.transactionService.getUserInvestSum(
      new Types.ObjectId(user?._id as string),
    );
    const userReinvestSum = await this.transactionService.getUserReInvestSum(
      new Types.ObjectId(user?._id as string),
    );
    const cashboxPullTopupSum =
      await this.pullTransactionService.getUserCashboxTopupSum(
        new Types.ObjectId(user?._id as string),
      );
    const referralSum = await this.pullTransactionService.getUserReferralSum(
      new Types.ObjectId(user?._id as string),
    );
    const swapSum = await this.transactionService.getUserSwapSum(
      new Types.ObjectId(user?._id as string),
    );

    ctx.replyWithMarkdown(
      `
Всего инвестировано: *${Math.floor(userInvestSum)} USDT = ${Math.floor(userInvestSum * emissionMultiplier)} ROST*

Всего реинвестировано: *${Math.floor(userReinvestSum)} ROST*

Доступный баланс: *${Math.floor(user.rostBalance)} ROST*

Всего начислено из ПУЛ КАССА: *${Math.floor(cashboxPullTopupSum)} ROST = ${Math.floor(cashboxPullTopupSum * emissionMultiplier)} USDT*

Всего начислено реферальных: *${Math.floor(referralSum)} ROST = ${Math.floor(referralSum * emissionMultiplier)} USDT*

Всего обменено *ROST* на *USDT*: *${swapSum}*

Доступный баланс USDT для вывода: *0*

Всего выведено: *0 USDT*
      `,
      {
        reply_markup: {
          keyboard: [
            [
              { text: 'Реинвестировать' },
              { text: 'Обмен ROST USDT' },
              { text: 'Вывод USDT' },
            ],
            [{ text: 'Главное меню' }, { text: 'Транзакции' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }
}
