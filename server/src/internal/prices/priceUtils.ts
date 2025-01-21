import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";
import { compareObjects } from "@/utils/genUtils.js";
import {
  BillWhen,
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  FullProduct,
  Organization,
  Price,
  PriceType,
  UsagePriceConfig,
  PricesInput,
} from "@autumn/shared";

export const getBillingType = (config: FixedPriceConfig | UsagePriceConfig) => {
  if (
    config.type == PriceType.Fixed &&
    config.interval == BillingInterval.OneOff
  ) {
    return BillingType.OneOff;
  } else if (config.type == PriceType.Fixed) {
    return BillingType.FixedCycle;
  }

  let usageConfig = config as UsagePriceConfig;
  if (usageConfig.bill_when == BillWhen.InAdvance) {
    return BillingType.UsageInAdvance;
  } else if (usageConfig.bill_when == BillWhen.BelowThreshold) {
    return BillingType.UsageBelowThreshold;
  }

  return BillingType.UsageInArrear;
};

export const getBillingInterval = (prices: Price[]) => {
  for (const price of prices) {
    if (price.config && price.config.interval) {
      return price.config.interval;
    }
  }
  return null;
};

export const pricesOnlyOneOff = (prices: Price[]) => {
  for (const price of prices) {
    if (price.billing_type != BillingType.OneOff) {
      return false;
    }
  }
  return true;
};

export const pricesContainRecurring = (prices: Price[]) => {
  return prices.some((price) => price.billing_type != BillingType.OneOff);
};

export const pricesOnlyRequireSetup = (prices: Price[]) => {
  return prices.every((price) => {
    return (
      price.billing_type == BillingType.UsageBelowThreshold ||
      price.billing_type == BillingType.UsageInArrear
    );
  });
};

// Check if prices have different recurring intervals
export const haveDifferentRecurringIntervals = (prices: Price[]) => {
  let interval = null;

  for (const price of prices) {
    const newInterval = price.config?.interval;

    if (newInterval == BillingInterval.OneOff) {
      continue;
    }

    if (interval !== null && newInterval !== null && newInterval !== interval) {
      return true;
    }

    interval = newInterval;
  }
  return false;
};

// Get bill now vs bill later prices
export const getBillNowPrices = (prices: Price[]) => {
  return prices.filter(
    (price) =>
      price.billing_type == BillingType.OneOff ||
      price.billing_type == BillingType.FixedCycle ||
      price.billing_type == BillingType.UsageInAdvance
  );
};

export const getBillLaterPrices = (prices: Price[]) => {
  return prices.filter(
    (price) =>
      price.billing_type == BillingType.UsageBelowThreshold ||
      price.billing_type == BillingType.UsageInArrear
  );
};

// Get price options
export const getEntPriceOption = (
  entId: string,
  prices: Price[],
  pricesInput: PricesInput
) => {
  const price = prices.find(
    (p) => "entitlement_id" in p.config! && p.config.entitlement_id === entId
  );

  if (!price) {
    return null;
  }

  return pricesInput.find((po) => po.id == price?.id)?.options;
};

export const comparePrices = (price1: Price, price2: Price) => {
  for (const key in price1.config) {
    const originalValue = (price1.config as any)[key];
    const newValue = (price2.config as any)[key];

    if (key == "usage_tiers") {
      for (let i = 0; i < originalValue.length; i++) {
        const originalTier = originalValue[i];
        const newTier = newValue[i];
        if (!compareObjects(originalTier, newTier)) {
          return false;
        }
      }
    } else if (originalValue !== newValue) {
      return false;
    }
  }

  return true;
};

export const getPriceOptions = (priceId: string, pricesInput: PricesInput) => {
  return pricesInput.find((po) => "id" in po && po.id === priceId)?.options;
};

export function compareBillingIntervals(
  a: BillingInterval | null,
  b: BillingInterval | null
): number {
  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  const priority = {
    [BillingInterval.OneOff]: 0,
    [BillingInterval.Month]: 1,
    [BillingInterval.Year]: 2,
  };

  return priority[a] - priority[b];
}

// Stripe items
export const getStripeSubItems = ({
  prices,
  product,
  org,
  pricesInput,
}: {
  prices: Price[];
  product: FullProduct;
  org: Organization;
  pricesInput: PricesInput;
}) => {
  let subItems: any[] = [];
  for (const price of prices) {
    subItems.push(
      priceToStripeItem({
        price,
        product,
        org,
        options: getPriceOptions(price.id!, pricesInput),
      })
    );
  }
  return subItems;
};
