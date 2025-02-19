export const getMillisecondsUntil9 = () => {
  const now = new Date();
  const target = new Date();

  // Устанавливаем в объекте target время 9:00:00.000
  target.setUTCHours(9, 0, 0, 0);

  // Если время уже позже 9:00, переносим цель на следующий день
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime(); // Разница в миллисекундах
};
