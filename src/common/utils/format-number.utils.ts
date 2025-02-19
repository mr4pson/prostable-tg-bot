export const formatNumber = (number: number | string) => {
  const parts = (Math.round(+number * 1000000) / 1000000)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    .split('.');

  const leftPart = parts[0];
  const rightPart = parts[1] && parts[1].replace(' ', '');
  const arr = [leftPart];

  if (rightPart) {
    arr.push(rightPart);
  }

  return arr.join('.');
};
