import {
  LimitedItem,
  OnDecrease,
  OnIncrease,
  ProductItem,
  ProductItemConfig,
  ProductItemInterval,
  UsageModel,
} from "@autumn/shared";

export const constructFeatureItem = ({
  featureId,
  includedUsage = 150,
  interval = ProductItemInterval.Month,
  entityFeatureId,
  isBoolean = false,
}: {
  featureId: string;
  includedUsage?: number;
  interval?: ProductItemInterval;
  entityFeatureId?: string;
  isBoolean?: boolean;
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

  return item;
};

export const constructPrepaidItem = ({
  featureId,
  price,
  billingUnits = 100,
  includedUsage = 0,
  isOneOff = false,
}: {
  featureId: string;
  price: number;
  billingUnits?: number;
  includedUsage?: number;
  isOneOff?: boolean;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.Prepaid,

    price: price,
    billing_units: billingUnits || 100,

    interval: isOneOff ? null : ProductItemInterval.Month,
    included_usage: includedUsage,
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
}: {
  featureId: string;
  includedUsage?: number;
  price?: number;
  billingUnits?: number;
  config?: ProductItemConfig;
  entityFeatureId?: string;
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
  };

  return item;
};

export const constructArrearProratedItem = ({
  featureId,
  pricePerUnit,
  includedUsage = 1,
  config = {
    on_increase: OnIncrease.BillImmediately,
    on_decrease: OnDecrease.None,
  },
}: {
  featureId: string;
  pricePerUnit: number;
  includedUsage?: number;
  config?: ProductItemConfig;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.PayPerUse,
    included_usage: includedUsage,
    price: pricePerUnit,
    billing_units: 1,
    interval: ProductItemInterval.Month,
    config,
  };

  return item;
};
