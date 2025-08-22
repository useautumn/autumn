import Stripe from "stripe";
import { Decimal } from "decimal.js";
import { notNullish } from "../utils.js";
import { FixedPriceConfig } from "../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import {
  BillWhen,
  UsagePriceConfig,
} from "../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
  BillingInterval,
  BillingType,
  PriceType,
} from "../../models/productModels/priceModels/priceEnums.js";
import { Price } from "../../models/productModels/priceModels/priceModels.js";
import { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import {
  OnDecrease,
  OnIncrease,
} from "../../models/productV2Models/productItemModels/productItemEnums.js";
import { APIVersion } from "../../enums/APIVersion.js";

export const getBillingType = (config: FixedPriceConfig | UsagePriceConfig) => {
  // 1. Fixed cycle / one off
  if (
    config.type == PriceType.Fixed &&
    config.interval == BillingInterval.OneOff
  ) {
    return BillingType.OneOff;
  } else if (config.type == PriceType.Fixed) {
    return BillingType.FixedCycle;
  }

  // 2. Prepaid

  let usageConfig = config as UsagePriceConfig;
  if (
    usageConfig.bill_when == BillWhen.InAdvance ||
    usageConfig.bill_when == BillWhen.StartOfPeriod
  ) {
    return BillingType.UsageInAdvance;
  } else if (usageConfig.bill_when == BillWhen.EndOfPeriod) {
    if (usageConfig.should_prorate) {
      return BillingType.InArrearProrated;
    }
    return BillingType.UsageInArrear;
  }

  return BillingType.UsageInArrear;
};

export const isOneOffPrice = ({ price }: { price: Price }) => {
  return price.config.interval == BillingInterval.OneOff;
};

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
      isUsage && (price.config as UsagePriceConfig).feature_id == featureId
    );
  }

  return isUsage;
};

export const isPrepaidPrice = ({ price }: { price: Price }) => {
  let billingType = getBillingType(price.config);
  return billingType == BillingType.UsageInAdvance;
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
