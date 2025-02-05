import {
  BillingInterval,
  BillingType,
  Feature,
  Price,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import {
  compareBillingIntervals,
  getBillingInterval,
  getBillingType,
} from "@/internal/prices/priceUtils.js";

export const isProductUpgrade = (
  product1: FullProduct,
  product2: FullProduct
) => {
  if (product1.is_default) {
    return true;
  } else if (product2.is_default) {
    return false;
  }

  // 1. If biling interval is same:
  let billingInterval1 = getBillingInterval(product1.prices);
  let billingInterval2 = getBillingInterval(product2.prices);

  // 1. Get total price for each product
  const getTotalPrice = (product: FullProduct) => {
    // Get each product's price prorated to a year
    let totalPrice = 0;
    for (const price of product.prices) {
      let interval = price.config?.interval;

      if (!interval || interval === BillingInterval.OneOff) {
        continue;
      }

      if ("usage_tiers" in price.config!) {
        // Just get total price for first tier
        totalPrice += price.config!.usage_tiers[0].amount;
      } else {
        totalPrice += price.config!.amount;
      }
    }
    return totalPrice;
  };

  if (billingInterval1 == billingInterval2) {
    return getTotalPrice(product1) < getTotalPrice(product2);
  } else {
    return compareBillingIntervals(billingInterval1, billingInterval2) < 0;
  }
};

export const isSameBillingInterval = (
  product1: FullProduct,
  product2: FullProduct
) => {
  return (
    getBillingInterval(product1.prices) === getBillingInterval(product2.prices)
  );
};

export const isFreeProduct = (prices: Price[]) => {
  if (prices.length === 0) {
    return true;
  }

  let totalPrice = 0;
  for (const price of prices) {
    if ("usage_tiers" in price.config!) {
      totalPrice += price.config!.usage_tiers.reduce(
        (acc, tier) => acc + tier.amount,
        0
      );
    } else {
      totalPrice += price.config!.amount;
    }
  }
  return totalPrice === 0;
};

export const getOptionsFromPrices = (prices: Price[], features: Feature[]) => {
  const featureToOptions: { [key: string]: any } = {};
  for (const price of prices) {
    if (price.config!.type == PriceType.Fixed) {
      continue;
    }

    const config = price.config! as UsagePriceConfig;
    // get billing tyoe
    const billingType = getBillingType(price.config!);
    const feature = features.find(
      (f) => f.internal_id === config.internal_feature_id
    );

    if (!feature) {
      continue;
    }

    if (billingType === BillingType.UsageBelowThreshold) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          threshold: 0,
        };
      } else {
        featureToOptions[feature.id].threshold = 0;
      }
    } else if (billingType === BillingType.UsageInAdvance) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          quantity: 0,
        };
      }

      featureToOptions[feature.id].quantity = 0;
    }
  }

  return Object.values(featureToOptions);
};
