import { ProductItem } from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";

export const isFeatureItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (nullish(item.amount) || item.amount == 0) &&
    nullish(item.tiers)
  );
};
