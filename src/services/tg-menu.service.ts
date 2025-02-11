import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';

@Injectable()
export class TgMenuService {
  public async setupMainMenu(ctx: Context) {
    ctx.reply(
      `
      💹 Курс: 1 ROST = 1 USDT

      Максимальная эмиссия: 250 000 ROST

      Сожжено: 0 ROST

      Всего держателей ROST: 155
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
    ctx.reply(
      `Это меню раздела "Баланс пополнения", здесь вы можете пополнить свой аккаунт USDT, принять участие в инвестировании, а так же отправить USDT пользователю бота.  Чтобы пополнить баланс нажмите на кнопку: Пополнить USDT

      Ваш баланс USDT: ${walletBalance}`,
      {
        reply_markup: {
          keyboard: [
            [
              { text: 'Пополнить USDT' },
              { text: 'Отправить USDT' },
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
}
