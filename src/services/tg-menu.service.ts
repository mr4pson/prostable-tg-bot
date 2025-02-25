import { Injectable } from '@nestjs/common';
import {
  calculateEmissionMultiplier,
  formatNumber,
  IReferralsInfo,
} from 'src/common';
import { User } from 'src/schemas';
import { Context } from 'telegraf';
import { UserService } from './user.service';
import { TransactionService } from './transaction.service';
import { Types } from 'mongoose';

@Injectable()
export class TgMenuService {
  constructor(
    private userService: UserService,
    private transactionService: TransactionService,
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

До следуюего повышения курса осталось выкупить: *${formatNumber(nextRateRaseNumber)} ROST*

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

*Ваш баланс USDT: ${walletBalance}*`,
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

  public setupROSTBalanceMenu(
    ctx: Context,
    rostBalance: number,
    groupVolume: number,
  ) {
    const emissionMultiplier = calculateEmissionMultiplier(rostBalance);

    ctx.replyWithMarkdown(
      `
*Личный объем:*

Накоплено в ПУЛ БИЗНЕС: *${rostBalance} ROST = ${(rostBalance * emissionMultiplier) / 2} USDT*

Ваше вознаграждение составит *х5 = ${rostBalance * 5} USDT*

Для получения большего вознаграждения вам осталось накопить ещё 2500 USDT в Пуле Бизнес

*Групповой объем: ${groupVolume} ROST = ${groupVolume * emissionMultiplier} USDT*

Для получения Лидерского Бонуса 1 ВТС 
Вам осталось накопить 40000 USDT Группового объема
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
в 1 линии - *5 человек*
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
    const userInvestSum = await this.transactionService.getUserInvestSum(
      new Types.ObjectId(user?._id as string),
    );
    const userReinvestSum = await this.transactionService.getUserReInvestSum(
      new Types.ObjectId(user?._id as string),
    );

    ctx.replyWithMarkdown(
      `
Всего инвестировано: *${userInvestSum} USDT = ${userInvestSum} ROST*

Доступный баланс: *${user.rostBalance} ROST*

Всего начислено из ПУЛ КАССА: *210 ROST = 210 USDT*

Всего начислено реферальных: *185 ROST = 185 USDT*

Всего реинвестировано: *${userReinvestSum} ROST*

Всего обменено *ROST* на *USDT*: *140*

Доступный баланс USDT для вывода: *10*

Всего выведено: *140 USDT*
      `,
      {
        reply_markup: {
          keyboard: [
            [
              { text: 'Реинвестировать' },
              { text: 'Обмен ROST USDT' },
              { text: 'Вывод USDT' },
            ],
            [{ text: 'Главное меню' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }
}
