import { compareObjects, notNullish } from "@/utils/genUtils.js";
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
  FullProduct,
  TierInfinite,
} from "@autumn/shared";

import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { Decimal } from "decimal.js";

const BillingIntervalOrder = [
  BillingInterval.Year,
  BillingInterval.SemiAnnual,
  BillingInterval.Quarter,
  BillingInterval.Month,
  BillingInterval.OneOff,
];

export const getBillingType = (config: FixedPriceConfig | UsagePriceConfig) => {
  // 1. Fixed cycle / one off
  if (
    config.type == PriceType.Fixed &&
    config.interval == BillingInterval.OneOff
  ) {
    return BillingType.OneOff;
  } else if (config.type == PriceType.Fixed) {
    return BillingType.FixedCycle;
  }

  // 2. Prepaid

  let usageConfig = config as UsagePriceConfig;
  if (
    usageConfig.bill_when == BillWhen.InAdvance ||
    usageConfig.bill_when == BillWhen.StartOfPeriod
  ) {
    return BillingType.UsageInAdvance;
  } else if (usageConfig.bill_when == BillWhen.EndOfPeriod) {
    if (usageConfig.should_prorate) {
      return BillingType.InArrearProrated;
    }
    return BillingType.UsageInArrear;
  }

  return BillingType.UsageInArrear;
};

export const getBillingInterval = (prices: Price[]) => {
  if (prices.length === 0) {
    return BillingInterval.OneOff;
  }

  const pricesCopy = structuredClone(prices);

  try {
    pricesCopy.sort((a, b) => {
      return (
        BillingIntervalOrder.indexOf(b.config!.interval!) -
        BillingIntervalOrder.indexOf(a.config!.interval!)
      );
    });
  } catch (error) {
    console.log("Error sorting prices:", error);
    throw error;
  }

  if (pricesCopy.length == 0) {
    throw new RecaseError({
      message: "No prices found, can't get billing interval",
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  return pricesCopy[pricesCopy.length - 1].config!.interval as BillingInterval;
};

export const pricesOnlyOneOff = (prices: Price[]) => {
  if (prices.length == 0) return false;

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
  entitlements: EntitlementWithFeature[],
  allowFeatureMatch = false
) => {
  let config = price.config as UsagePriceConfig;

  const entitlement = entitlements.find((ent) => {
    let entIdMatch =
      notNullish(price.entitlement_id) && price.entitlement_id == ent.id;

    let featureIdMatch =
      notNullish(config.internal_feature_id) &&
      config.internal_feature_id == ent.internal_feature_id;

    let productIdMatch = ent.internal_product_id == price.internal_product_id;

    if (allowFeatureMatch) {
      return (entIdMatch || featureIdMatch) && productIdMatch;
    }

    return entIdMatch && productIdMatch;
  });

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
    [BillingInterval.Quarter]: 2,
    [BillingInterval.SemiAnnual]: 3,
    [BillingInterval.Year]: 4,
  };

  return priority[a] - priority[b];
}

export const getUsageTier = (price: Price, quantity: number) => {
  let usageConfig = price.config as UsagePriceConfig;
  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    if (i == usageConfig.usage_tiers.length - 1) {
      return usageConfig.usage_tiers[i];
    }

    let tier = usageConfig.usage_tiers[i];
    if (tier.to == TierInfinite || tier.to >= quantity) {
      return tier;
    }
  }
  return usageConfig.usage_tiers[0];
};

export const getPriceAmount = ({
  price,
  options,
  relatedEnt,
}: {
  price: Price;
  options?: FeatureOptions;
  relatedEnt?: EntitlementWithFeature;
  quantity?: number;
}) => {
  let billingType = getBillingType(price.config!);
  if (billingType == BillingType.OneOff) {
    let config = price.config as FixedPriceConfig;
    return Number(config.amount.toFixed(2));
  } else if (billingType == BillingType.UsageInAdvance) {
    let quantity = options?.quantity!;
    let config = price.config as UsagePriceConfig;

    // 1. Allowance
    let allowance = relatedEnt?.allowance;

    let overage = quantity * config.billing_units! - allowance!;

    return getPriceForOverage(price, overage);
  }

  return 0;
};

export const getPriceForOverage = (price: Price, overage: number) => {
  let usageConfig = price.config as UsagePriceConfig;
  let billingType = getBillingType(usageConfig);

  if (
    billingType !== BillingType.UsageInArrear &&
    billingType !== BillingType.InArrearProrated &&
    billingType !== BillingType.UsageInAdvance
  ) {
    throw new RecaseError({
      message: `getPriceForOverage not implemented for this billing type: ${billingType}`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  let amount = 0;
  let billingUnits = usageConfig.billing_units || 1;
  let remainingUsage = new Decimal(
    Math.ceil(new Decimal(overage).div(billingUnits).toNumber())
  )
    .mul(billingUnits)
    .toNumber();

  let lastTo: number = 0;
  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    let tier = usageConfig.usage_tiers[i];

    let amountUsed = 0;
    if (tier.to == TierInfinite || tier.to == -1) {
      amountUsed = remainingUsage;
    } else {
      amountUsed = Math.min(remainingUsage, tier.to - lastTo);
      lastTo = tier.to;
    }

    // Divide amount by billing units
    let amountPerUnit = new Decimal(tier.amount)
      .div(usageConfig.billing_units!)
      .toNumber();

    amount += amountPerUnit * amountUsed;
    remainingUsage -= amountUsed;

    if (remainingUsage <= 0) {
      break;
    }
  }

  return Number(amount.toFixed(10));
};

export const priceToEventName = (productName: string, featureName: string) => {
  return `${productName} - ${featureName}`;
};

export const roundPriceAmounts = (price: Price) => {
  if (price.config!.type == PriceType.Fixed) {
    const config = price.config as FixedPriceConfig;
    config.amount = Number(config.amount.toFixed(10));
    price.config = config;
  } else if (price.config!.type == PriceType.Usage) {
    const config = price.config as UsagePriceConfig;
    for (let i = 0; i < config.usage_tiers.length; i++) {
      config.usage_tiers[i].amount = Number(
        config.usage_tiers[i].amount.toFixed(10)
      );
    }

    price.config = config;
  }
};

export const priceIsOneOffAndTiered = (
  price: Price,
  relatedEnt: EntitlementWithFeature
) => {
  let config = price.config as UsagePriceConfig;
  if (config.type == PriceType.Fixed) {
    return false;
  }

  return (
    // (config.interval == BillingInterval.OneOff &&
    //   config.usage_tiers.length > 0 &&
    //   relatedEnt.allowance &&
    //   relatedEnt.allowance > 0) ||
    config.interval == BillingInterval.OneOff && config.usage_tiers.length > 1
  );
};

export const getProductForPrice = (price: Price, products: FullProduct[]) => {
  return products.find(
    (product) => product.internal_id === price.internal_product_id
  );
};

// Price to price / tiers
export const priceToAmountOrTiers = (price: Price) => {
  if (price.config!.type == PriceType.Fixed) {
    let config = price.config as FixedPriceConfig;
    return {
      price: config.amount,
    };
  } else {
    let config = price.config as UsagePriceConfig;
    if (config.usage_tiers.length > 1) {
      return {
        tiers: config.usage_tiers,
      };
    } else {
      return {
        price: config.usage_tiers[0].amount,
      };
    }
  }
};

export const roundUsage = ({
  usage,
  billingUnits,
}: {
  usage: number;
  billingUnits: number;
}) => {
  if (!billingUnits || billingUnits == 1) {
    return usage;
  }

  return new Decimal(usage)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();
};
