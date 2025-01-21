import { BillingInterval } from "@autumn/shared";

import { FixedPriceConfig, Price, UsagePriceConfig } from "@autumn/shared";

export const validBillingInterval = (
  prices: Price[],
  config: FixedPriceConfig | UsagePriceConfig
) => {
  const interval1 = config.interval;
  if (!interval1 || interval1 == BillingInterval.OneOff) {
    return true;
  }

  for (const price of prices) {
    const interval2 = price.config?.interval;

    if (!interval2 || interval2 == BillingInterval.OneOff) {
      continue;
    }

    if (interval1 != interval2) {
      return false;
    }
  }

  return true;
};
