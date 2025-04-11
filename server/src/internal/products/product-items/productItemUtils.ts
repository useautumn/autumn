import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  EntInterval,
  ProductItemInterval,
  BillingInterval,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";

export const intervalIsNone = (interval: string | undefined | null) => {
  if (!interval) {
    return true;
  }
  return (
    interval == ProductItemInterval.None ||
    interval == EntInterval.Lifetime ||
    interval == BillingInterval.OneOff
  );
};

export const itemIsFixedPrice = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};

export const itemIsFree = (item: ProductItem) => {
  return nullish(item.amount) && nullish(item.tiers);
};

export const getItemType = (item: ProductItem) => {
  if (itemIsFixedPrice(item)) {
    return ProductItemType.Price;
  } else if (itemIsFree(item)) {
    return ProductItemType.Feature;
  }

  return ProductItemType.FeaturePrice;
};
