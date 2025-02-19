export const calculateEmissionMultiplier = (
  techUserRostWalletBalance: number,
) => {
  if (techUserRostWalletBalance > 200_000) {
    return 1;
  }

  if (techUserRostWalletBalance > 150_000 && 199_999) {
    return 2;
  }

  if (techUserRostWalletBalance > 100_000 && 149_999) {
    return 3;
  }

  if (techUserRostWalletBalance > 50_000 && 99_999) {
    return 4;
  }

  if (techUserRostWalletBalance < 49_999) {
    return 5;
  }
};
