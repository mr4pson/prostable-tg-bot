export function chunkArray<T>(
  array: Array<T>,
  chunkSize = 40,
): Array<Array<T>> {
  const result = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }

  return result;
}
