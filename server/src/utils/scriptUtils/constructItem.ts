import {
  LimitedItem,
  OnDecrease,
  OnIncrease,
  ProductItem,
  ProductItemConfig,
  ProductItemInterval,
  RolloverConfig,
  UsageModel,
} from "@autumn/shared";

export const constructFeatureItem = ({
  featureId,
  includedUsage = 150,
  interval = ProductItemInterval.Month,
  entityFeatureId,
  isBoolean = false,
  rolloverConfig,
}: {
  featureId: string;
  includedUsage?: number;
  interval?: ProductItemInterval | null;
  entityFeatureId?: string;
  isBoolean?: boolean;
  rolloverConfig?: RolloverConfig;
}) => {
  if (isBoolean) {
    return {
      feature_id: featureId,
      entity_feature_id: entityFeatureId,
    };
  }
  let item: LimitedItem = {
    feature_id: featureId,
    included_usage: includedUsage,
    entity_feature_id: entityFeatureId,
    interval: interval,
  };

  if (rolloverConfig) {
    item.config = {
      rollover: rolloverConfig,
    };
  }

  return item;
};

export const constructPrepaidItem = ({
  featureId,
  price = 9,
  billingUnits = 100,
  includedUsage = 0,
  isOneOff = false,
  config = {
    on_increase: OnIncrease.ProrateImmediately,
    on_decrease: OnDecrease.ProrateImmediately,
  },
  usageLimit,
}: {
  featureId: string;
  price?: number;
  billingUnits?: number;
  includedUsage?: number;
  isOneOff?: boolean;
  config?: ProductItemConfig;
  usageLimit?: number;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.Prepaid,

    price: price,
    billing_units: billingUnits || 100,

    interval: isOneOff ? null : ProductItemInterval.Month,
    included_usage: includedUsage,

    config,
    usage_limit: usageLimit,
  };

  return item;
};

export const constructArrearItem = ({
  featureId,
  includedUsage = 10000,
  price = 0.1,
  billingUnits = 1000,
  config = {
    on_increase: OnIncrease.ProrateImmediately,
    on_decrease: OnDecrease.ProrateImmediately,
  },
  entityFeatureId,
  usageLimit,
}: {
  featureId: string;
  includedUsage?: number;
  price?: number;
  billingUnits?: number;
  config?: ProductItemConfig;
  entityFeatureId?: string;
  usageLimit?: number;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.PayPerUse,
    included_usage: includedUsage,
    price: price,
    billing_units: billingUnits,
    interval: ProductItemInterval.Month,
    reset_usage_when_enabled: true,
    config,
    entity_feature_id: entityFeatureId,
    usage_limit: usageLimit,
  };

  return item;
};

export const constructArrearProratedItem = ({
  featureId,
  pricePerUnit = 10,
  includedUsage = 1,
  config = {
    on_increase: OnIncrease.BillImmediately,
    on_decrease: OnDecrease.None,
  },
  usageLimit,
}: {
  featureId: string;
  pricePerUnit?: number;
  includedUsage?: number;
  config?: ProductItemConfig;
  usageLimit?: number;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.PayPerUse,
    included_usage: includedUsage,
    price: pricePerUnit,
    billing_units: 1,
    interval: ProductItemInterval.Month,
    config,
    usage_limit: usageLimit,
  };

  return item;
};

export const constructFixedPrice = ({
  price,
  interval = ProductItemInterval.Month,
}: {
  price: number;
  interval?: ProductItemInterval;
}) => {
  return {
    price,
    interval,
  };
};
