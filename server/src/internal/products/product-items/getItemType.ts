import { notNullish } from "@/utils/genUtils.js";
import { ProductItem } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

export const isBooleanFeatureItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (nullish(item.amount) || item.amount == 0) &&
    nullish(item.tiers) &&
    nullish(item.interval) &&
    nullish(item.included_usage)
  );
};

export const isFeatureItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (nullish(item.amount) || item.amount == 0) &&
    nullish(item.tiers)
  );
};

export const isPriceItem = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};
