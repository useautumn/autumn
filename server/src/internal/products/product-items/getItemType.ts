import { notNullish } from "@/utils/genUtils.js";
import { ProductItem } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

export const isFeatureItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (nullish(item.amount) || item.amount == 0) &&
    nullish(item.tiers)
  );
};

export const isFixedPriceItem = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};
