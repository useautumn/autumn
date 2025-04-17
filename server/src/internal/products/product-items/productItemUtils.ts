import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  EntInterval,
  ProductItemInterval,
  BillingInterval,
  ProductItem,
  ProductItemType,
  UsageModel,
  Infinite,
} from "@autumn/shared";
import { isFeatureItem } from "./getItemType.js";
import {
  billingToItemInterval,
  entToItemInterval,
} from "./itemIntervalUtils.js";

export const itemsAreSame = (item1: ProductItem, item2: ProductItem) => {
  // Compare tiers
  const compareTiers = (tiers1: any, tiers2: any) => {
    if (!tiers1 && !tiers2) {
      return true;
    }

    if (!tiers1 || !tiers2) {
      return false;
    }

    if (tiers1.length !== tiers2.length) {
      return false;
    }

    return tiers1.every(
      (tier: any, index: number) =>
        tier.amount === tiers2[index].amount && tier.to === tiers2[index].to
    );
  };
  return (
    item1.feature_id == item2.feature_id &&
    item1.included_usage == item2.included_usage &&
    item1.interval == item2.interval &&
    item1.reset_usage_on_billing === item2.reset_usage_on_billing &&
    item1.amount == item2.amount &&
    compareTiers(item1.tiers, item2.tiers)
  );
};

// export const intervalIsNone = (interval: string | undefined | null) => {
//   if (!interval) {
//     return true;
//   }
//   return (
//     interval == ProductItemInterval.None ||
//     interval == EntInterval.Lifetime ||
//     interval == BillingInterval.OneOff
//   );
// };

export const itemIsFixedPrice = (item: ProductItem) => {
  return notNullish(item.amount) && nullish(item.feature_id);
};

export const isFeaturePriceItem = (item: ProductItem) => {
  return (
    notNullish(item.feature_id) &&
    (notNullish(item.amount) || notNullish(item.tiers))
  );
};

export const getItemType = (item: ProductItem) => {
  if (itemIsFixedPrice(item)) {
    return ProductItemType.Price;
  } else if (isFeatureItem(item)) {
    return ProductItemType.Feature;
  }

  return ProductItemType.FeaturePrice;
};

// FOR TESTS?
export const constructFeatureItem = ({
  feature_id,
  included_usage,
  interval,
  entitlement_id,
}: {
  feature_id: string;
  included_usage?: number | string;
  interval?: EntInterval;
  entitlement_id?: string;
}) => {
  let item: ProductItem = {
    feature_id,
    included_usage: included_usage as number,
    interval: entToItemInterval(interval),
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
  usage_model,
  reset_usage_on_billing = true,
  billing_units = 1,
  carry_over_usage = true,
}: {
  feature_id: string;
  included_usage?: number;
  amount: number;
  interval: BillingInterval;
  usage_model?: UsageModel;
  reset_usage_on_billing?: boolean;
  billing_units?: number;
  carry_over_usage?: boolean;
}) => {
  let item: ProductItem & {
    included_usage: number;
  } = {
    feature_id,
    included_usage: included_usage as number,
    amount,
    interval: billingToItemInterval(interval),
    usage_model,
    reset_usage_on_billing,
    billing_units,
    carry_over_usage,
  };

  return item;
};
