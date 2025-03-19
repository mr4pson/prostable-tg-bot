import { PullTransactionType, TransactionType } from '../enums';

export const getTransactionName = (
  transactionType: PullTransactionType | TransactionType,
) => {
  switch (transactionType) {
    case PullTransactionType.BUSINESS:
      return 'Зачисление в пул БИЗНЕС';

    case PullTransactionType.CASH_BOX_TOPUP:
      return 'Начисление из пула КАССА';

    case PullTransactionType.REFERRAL:
      return 'Начисление реферальной выплаты';

    case TransactionType.INVEST:
      return 'Инвестировано';

    case TransactionType.REINVEST:
      return 'Реинвестировано';
    default:
      break;
  }
};
