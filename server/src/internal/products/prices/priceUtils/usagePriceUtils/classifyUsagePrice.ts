import {
  APIVersion,
  BillingInterval,
  BillingType,
  FullCusProduct,
  OnDecrease,
  OnIncrease,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { getBillingType } from "../../priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import Stripe from "stripe";
import { Decimal } from "decimal.js";

export const isUsagePrice = ({
  price,
  featureId,
}: {
  price: Price;
  featureId?: string;
}) => {
  let billingType = getBillingType(price.config);

  let isUsage =
    billingType == BillingType.UsageInArrear ||
    billingType == BillingType.InArrearProrated ||
    billingType == BillingType.UsageInAdvance;

  if (featureId) {
    return (
      isUsage && (price.config as UsagePriceConfig).feature_id === featureId
    );
  }

  return isUsage;
};

export const isPayPerUse = ({ price }: { price: Price }) => {
  let billingType = getBillingType(price.config);
  return (
    billingType == BillingType.UsageInArrear ||
    billingType == BillingType.InArrearProrated
  );
};

export const isFixedPrice = ({ price }: { price: Price }) => {
  let billingType = getBillingType(price.config);

  return (
    billingType == BillingType.FixedCycle || billingType == BillingType.OneOff
  );
};

export const hasPrepaidPrice = ({
  prices,
  excludeOneOff,
}: {
  prices: Price[];
  excludeOneOff?: boolean;
}) => {
  return prices.some((price) => {
    let isUsage = getBillingType(price.config) == BillingType.UsageInAdvance;
    let isOneOff = price.config.interval == BillingInterval.OneOff;
    return isUsage && (excludeOneOff ? !isOneOff : true);
  });
};

export const isV4Usage = ({
  price,
  cusProduct,
}: {
  price: Price;
  cusProduct: FullCusProduct;
}) => {
  const billingType = getBillingType(price.config);

  return (
    billingType == BillingType.UsageInArrear &&
    (cusProduct.api_version == APIVersion.v1_4 ||
      notNullish(cusProduct.internal_entity_id))
  );
};

// export const
export const onIncreaseToStripeProration = ({
  onIncrease,
}: {
  onIncrease: OnIncrease;
}) => {
  let behavior = "none";
  if (onIncrease === OnIncrease.ProrateImmediately) {
    behavior = "always_invoice";
  } else if (onIncrease === OnIncrease.ProrateNextCycle) {
    behavior = "create_prorations";
  }

  return behavior as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;
};

export const onDecreaseToStripeProration = ({
  onDecrease,
}: {
  onDecrease: OnDecrease;
}) => {
  let behavior = "none";
  if (onDecrease === OnDecrease.ProrateImmediately) {
    behavior = "always_invoice";
  } else if (onDecrease === OnDecrease.ProrateNextCycle) {
    behavior = "create_prorations";
  }

  return behavior as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;
};

export const roundUsage = ({
  usage,
  price,
  pos = true,
}: {
  usage: number;
  price: Price;
  pos?: boolean;
}) => {
  let config = price.config as UsagePriceConfig;
  let billingUnits = config.billing_units || 1;

  let rounded = new Decimal(usage)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();

  if (pos) {
    return Math.max(rounded, 0);
  }

  return rounded;
};
