import {
  BillingType,
  EntitlementWithFeature,
  Feature,
  UsageModel,
  UsagePriceConfig,
  BillingInterval,
} from "@autumn/shared";

import { Price } from "@autumn/shared";
import { getBillingType, getPriceEntitlement } from "../priceUtils.js";
import { isFixedPrice } from "./usagePriceUtils/classifyUsagePrice.js";

export const priceToIntervalKey = (price: Price) => {
  return toIntervalKey({
    interval: price.config?.interval,
    intervalCount: price.config?.interval_count ?? 1,
  });
};

export const toIntervalKey = ({
  interval,
  intervalCount,
}: {
  interval: BillingInterval;
  intervalCount: number;
}) => {
  if (interval == BillingInterval.OneOff) {
    return BillingInterval.OneOff;
  } else if (interval == BillingInterval.Quarter) {
    let finalCount = (intervalCount ?? 1) * 3;
    return `${BillingInterval.Month}-${finalCount}`;
  } else if (interval == BillingInterval.SemiAnnual) {
    let finalCount = (intervalCount ?? 1) * 6;
    return `${BillingInterval.Month}-${finalCount}`;
  } else if (interval == BillingInterval.Year) {
    return BillingInterval.Year;
  }
  return `${interval}-${intervalCount}`;
};

export const intervalKeyToPrice = (intervalKey: string) => {
  const [interval, intervalCount] = intervalKey.split("-");
  return {
    interval: interval as BillingInterval,
    intervalCount: intervalCount ? parseInt(intervalCount) : 1,
  };
};

export const priceToFeature = ({
  price,
  ents,
  features,
}: {
  price: Price;
  ents?: EntitlementWithFeature[];
  features?: Feature[];
}) => {
  if (!features && !ents) {
    throw new Error("priceToFeature requires either ents or features as arg");
  }

  if (features) {
    return features.find(
      (f) =>
        f.internal_id == (price.config as UsagePriceConfig).internal_feature_id
    );
  }

  const ent = getPriceEntitlement(price, ents!);
  return ent?.feature;
};

export const priceToUsageModel = (price: Price) => {
  let billingType = getBillingType(price.config);
  if (isFixedPrice({ price })) {
    return undefined;
  }
  if (billingType == BillingType.UsageInAdvance) {
    return UsageModel.Prepaid;
  }
  return UsageModel.PayPerUse;
};
