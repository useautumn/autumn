import {
  BillingInterval,
  EntInterval,
  Infinite,
  ProductItem,
  ProductItemInterval,
  ProductItemType,
} from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";
import { isFeatureItem, isPriceItem } from "./getItemType";

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
  if (isPriceItem(item)) {
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
    price: notNullish(item.price) || notNullish(item.tiers),
    feature: !isPriceItem(item),
    allowance: true,
    perEntity: notNullish(item.entity_feature_id),
    cycle: true,
  };
};
