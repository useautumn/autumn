import {
  BillingInterval,
  EntInterval,
  ProductItem,
  ProductItemInterval,
  ProductItemType,
  UsageUnlimited,
} from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";

export const itemIsFixedPrice = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};

export const itemIsFree = (item: ProductItem) => {
  return nullish(item.amount) && nullish(item.tiers);
};

export const itemIsUnlimited = (item: ProductItem) => {
  return item.included_usage == UsageUnlimited;
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
  }).format(amount);
};

export const getItemType = (item: ProductItem) => {
  if (itemIsFixedPrice(item)) {
    return ProductItemType.Price;
  } else if (itemIsFree(item)) {
    return ProductItemType.Feature;
  }

  return ProductItemType.FeaturePrice;
};

export const intervalIsNone = (interval: any) => {
  return (
    interval == ProductItemInterval.None ||
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
    cycle: item.interval !== ProductItemInterval.None,
  };
};
