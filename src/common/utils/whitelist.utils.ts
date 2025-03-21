export const verifyWithdraw = (tgUserId: number): boolean => {
  const whitelist = [
    1153943575, 7436135144, 847877604, 803186395, 496834311, 386112959,
  ];

  return whitelist.includes(tgUserId);
};
