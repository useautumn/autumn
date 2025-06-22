import { ProductItem } from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";

export const isEmptyItem = (item: ProductItem) => {
  return nullish(item.price) && nullish(item.feature_id) && nullish(item.tiers);
};

export const isFeatureItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (nullish(item.price) || item.price == 0) &&
    nullish(item.tiers)
  );
};

export const isPriceItem = (item: ProductItem) => {
  return notNullish(item.price) && nullish(item.feature_id);
};

export const isFeaturePriceItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (notNullish(item.price) || notNullish(item.tiers))
  );
};
