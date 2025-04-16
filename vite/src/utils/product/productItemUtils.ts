import {
  BillingInterval,
  EntInterval,
  Infinite,
  ProductItem,
  ProductItemInterval,
  ProductItemType,
} from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";
import { isFeatureItem } from "./getItemType";

export const itemIsFixedPrice = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};

// export const itemIsFree = (item: ProductItem) => {
//   return (nullish(item.amount) || item.amount === 0) && nullish(item.tiers);
// };

export const itemIsUnlimited = (item: ProductItem) => {
  return item.included_usage == Infinite;
};

export const formatAmount = ({
  defaultCurrency,
  amount,
}: {
  defaultCurrency: string;
  amount: number;
}) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: defaultCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(amount);
};

export const getItemType = (item: ProductItem) => {
  if (itemIsFixedPrice(item)) {
    return ProductItemType.Price;
  } else if (isFeatureItem(item)) {
    return ProductItemType.Feature;
  }

  return ProductItemType.FeaturePrice;
};

export const intervalIsNone = (interval: any) => {
  return (
    nullish(interval) ||
    interval == EntInterval.Lifetime ||
    interval == BillingInterval.OneOff
  );
};

export const getShowParams = (item: ProductItem | null) => {
  if (!item) {
    return {
      price: false,
      feature: false,
      allowance: false,
      perEntity: false,
      cycle: false,
    };
  }

  return {
    price: notNullish(item.amount) || notNullish(item.tiers),
    feature: !itemIsFixedPrice(item),
    allowance: true,
    perEntity: notNullish(item.entity_feature_id),
    cycle: true,
  };
};
