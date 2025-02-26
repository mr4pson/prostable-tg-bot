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

export const calculateBusinessPullRate = (
  pullBusinessSum: number,
): { rate: number; limit?: number } => {
  if (pullBusinessSum < 501) {
    return { rate: 5, limit: 500 };
  }

  if (pullBusinessSum >= 501 && pullBusinessSum < 2501) {
    return { rate: 10, limit: 2500 };
  }

  if (pullBusinessSum >= 2501 && pullBusinessSum < 5001) {
    return { rate: 15, limit: 5000 };
  }

  if (pullBusinessSum >= 5001) {
    return { rate: 20 };
  }
};
