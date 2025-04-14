import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  EntInterval,
  ProductItemInterval,
  BillingInterval,
  ProductItem,
  ProductItemType,
  ProductItemBehavior,
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

export const isFeaturePriceItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (notNullish(item.amount) || notNullish(item.tiers))
  );
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

export const itemToEntInterval = (item: any) => {
  // if (!item.interval) {
  //   return null;
  // }

  if (
    item.interval == ProductItemInterval.None ||
    item.interval == EntInterval.Lifetime
  ) {
    return EntInterval.Lifetime;
  }

  if (item.reset_usage_on_interval === false) {
    return EntInterval.Lifetime;
  }

  if (isFeaturePriceItem(item) && notNullish(item.reset_interval)) {
    return item.reset_interval as any;
  }

  return item.interval;
};

// FOR TESTS?
export const constructFeatureItem = ({
  feature_id,
  included_usage,
  interval,
  entitlement_id,
}: {
  feature_id: string;
  included_usage?: number | "unlimited";
  interval?: EntInterval;
  entitlement_id?: string;
}) => {
  let item: ProductItem = {
    feature_id,
    included_usage,
    interval: interval as any,
    entitlement_id,
  };

  return item;
};

export const constructPriceItem = ({
  amount,
  interval,
}: {
  amount: number;
  interval: BillingInterval;
}) => {
  let item: ProductItem = {
    amount,
    interval: interval as any,
  };

  return item;
};

export const constructFeaturePriceItem = ({
  feature_id,
  included_usage,
  amount,
  interval,
  behavior,
  reset_usage_on_interval = false,
  billing_units = 1,
  carry_over_usage = true,
}: {
  feature_id: string;
  included_usage?: number;
  amount: number;
  interval: BillingInterval;
  behavior?: ProductItemBehavior;
  reset_usage_on_interval?: boolean;
  billing_units?: number;
  carry_over_usage?: boolean;
}) => {
  let item: ProductItem & {
    included_usage: number;
  } = {
    feature_id,
    included_usage: included_usage as number,
    amount,
    interval: interval as any,
    behavior,
    reset_usage_on_interval,
    billing_units,
    carry_over_usage,
  };

  return item;
};
