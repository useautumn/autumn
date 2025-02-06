import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";
import { compareObjects } from "@/utils/genUtils.js";
import {
  BillWhen,
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  Price,
  PriceType,
  UsagePriceConfig,
  Entitlement,
  EntitlementWithFeature,
  FeatureOptions,
  ErrCode,
} from "@autumn/shared";
import { AttachParams } from "../customers/products/AttachParams.js";

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
  if (
    usageConfig.bill_when == BillWhen.InAdvance ||
    usageConfig.bill_when == BillWhen.StartOfPeriod
  ) {
    return BillingType.UsageInAdvance;
  } else if (usageConfig.bill_when == BillWhen.BelowThreshold) {
    return BillingType.UsageBelowThreshold;
  } else if (usageConfig.bill_when == BillWhen.EndOfPeriod) {
    return BillingType.UsageInArrear;
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
  return prices.every((price) => {
    let interval = price.config?.interval;

    if (!interval || interval != BillingInterval.OneOff) {
      return false;
    }
    return true;
  });
};

export const pricesContainRecurring = (prices: Price[]) => {
  // TODO: Look into this...
  return prices.some((price) => {
    const interval = price.config?.interval;

    if (interval && interval != BillingInterval.OneOff) {
      return true;
    }

    return false;
  });
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
export const getCheckoutRelevantPrices = (prices: Price[]) => {
  return prices.filter(
    (price) =>
      price.billing_type == BillingType.OneOff ||
      price.billing_type == BillingType.FixedCycle ||
      price.billing_type == BillingType.UsageInAdvance ||
      price.billing_type == BillingType.UsageInArrear
  );
};

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
export const getEntOptions = (
  optionsList: FeatureOptions[],
  entitlement: Entitlement | EntitlementWithFeature
) => {
  if (!entitlement) {
    return null;
  }
  const options = optionsList.find(
    (options) => options.internal_feature_id === entitlement.internal_feature_id
  );
  return options;
};

export const getPriceEntitlement = (
  price: Price,
  entitlements: EntitlementWithFeature[]
) => {
  let config = price.config as UsagePriceConfig;

  const entitlement = entitlements.find(
    (ent) => ent.internal_feature_id === config.internal_feature_id
  );

  return entitlement as EntitlementWithFeature;
};

export const getPriceOptions = (
  price: Price,
  optionsList: FeatureOptions[]
) => {
  let config = price.config as UsagePriceConfig;

  const options = optionsList.find(
    (options) => options.internal_feature_id === config.internal_feature_id
  );

  return options;
};

export const pricesAreSame = (price1: Price, price2: Price) => {
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
    [BillingInterval.Quarter]: 3,
    [BillingInterval.SemiAnnual]: 4,
  };

  return priority[a] - priority[b];
}

// Stripe items
export const getStripeSubItems = ({
  attachParams,
  isCheckout = false,
}: {
  attachParams: AttachParams;
  isCheckout?: boolean;
}) => {
  const { product, prices, entitlements, optionsList, org } = attachParams;
  // const billNowPrices = getBillNowPrices(prices);
  const checkoutRelevantPrices = getCheckoutRelevantPrices(prices);

  let subItems: any[] = [];
  let itemMetas: any[] = [];

  // TODO: Check if non bill now prices can be added to stripe subscription...?
  for (const price of checkoutRelevantPrices) {
    const priceEnt = getPriceEntitlement(price, entitlements);
    const options = getEntOptions(optionsList, priceEnt);

    const { lineItem, lineItemMeta } = priceToStripeItem({
      price,
      product,
      org,
      options,
      isCheckout,
    });

    subItems.push(lineItem);
    itemMetas.push(lineItemMeta);
  }

  console.log("Line items: ", subItems);

  return { items: subItems, itemMetas };
};

export const getUsageTier = (price: Price, quantity: number) => {
  let usageConfig = price.config as UsagePriceConfig;
  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    if (i == usageConfig.usage_tiers.length - 1) {
      return usageConfig.usage_tiers[i];
    }

    let tier = usageConfig.usage_tiers[i];
    if (tier.from <= quantity && tier.to >= quantity) {
      return tier;
    }
  }
  return usageConfig.usage_tiers[0];
};

export const getPriceAmount = (price: Price, options: FeatureOptions) => {
  if (price.billing_type == BillingType.OneOff) {
    let config = price.config as FixedPriceConfig;
    return {
      amountPerUnit: config.amount,
      quantity: 1,
    };
  } else if (price.billing_type == BillingType.UsageInAdvance) {
    let quantity = options.quantity!;
    let usageTier = getUsageTier(price, quantity);

    return {
      amountPerUnit: usageTier.amount,
      quantity: quantity,
    };
  }

  return {
    amountPerUnit: -1,
    quantity: -1,
  };
};

export const priceToStripeTiers = (price: Price, entitlement: Entitlement) => {
  let usageConfig = price.config as UsagePriceConfig;
  const tiers: any[] = [];
  if (entitlement.allowance) {
    tiers.push({
      unit_amount: 0,
      up_to: entitlement.allowance,
    });

    for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
      usageConfig.usage_tiers[i].from += entitlement.allowance;
      if (usageConfig.usage_tiers[i].to != -1) {
        usageConfig.usage_tiers[i].to += entitlement.allowance;
      }
    }
  }

  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];
    tiers.push({
      unit_amount: tier.amount * 100,
      up_to: tier.to == -1 ? "inf" : tier.to,
    });
  }
  return tiers;
};

export const priceToEventName = (productName: string, featureName: string) => {
  return `${productName} - ${featureName}`;
};
