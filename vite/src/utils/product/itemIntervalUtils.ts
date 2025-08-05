import { nullish } from "@/utils/genUtils.js";
import {
  BillingInterval,
  EntInterval,
  ProductItem,
  ProductItemFeatureType,
  ProductItemInterval,
} from "@autumn/shared";

export const billingToItemInterval = (billingInterval: BillingInterval) => {
  if (billingInterval == BillingInterval.OneOff) {
    return null;
  }

  return billingInterval as unknown as ProductItemInterval;
};

export const entToItemInterval = (entInterval: EntInterval) => {
  if (entInterval == EntInterval.Lifetime) {
    return null;
  }
  return entInterval as unknown as ProductItemInterval;
};

export const itemToBillingInterval = (item: ProductItem) => {
  if (nullish(item.interval)) {
    return BillingInterval.OneOff;
  }

  return item.interval;
};

export const itemToEntInterval = (item: ProductItem) => {
  if (nullish(item.interval)) {
    return EntInterval.Lifetime;
  }

  if (item.feature_type == ProductItemFeatureType.ContinuousUse) {
    return EntInterval.Lifetime;
  }

  return item.interval as unknown as EntInterval;
};
