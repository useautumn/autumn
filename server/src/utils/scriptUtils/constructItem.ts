import { ProductItem, ProductItemInterval, UsageModel } from "@autumn/shared";

export const constructPrepaidItem = ({
  featureId,
  price,
  billingUnits = 100,
  isOneOff = false,
}: {
  featureId: string;
  price: number;
  billingUnits?: number;
  isOneOff?: boolean;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.Prepaid,

    price: price,
    billing_units: billingUnits || 100,

    interval: isOneOff ? null : ProductItemInterval.Month,
  };

  return item;
};

export const constructArrearItem = ({ featureId }: { featureId: string }) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.PayPerUse,
    included_usage: 10000,
    price: 0.1,
    billing_units: 1000,
    interval: ProductItemInterval.Month,
    reset_usage_when_enabled: true,
  };

  return item;
};

export const constructArrearProratedItem = ({
  featureId,
  pricePerUnit,
}: {
  featureId: string;
  pricePerUnit: number;
}) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.PayPerUse,
    included_usage: 1,
    price: pricePerUnit,
    billing_units: 1,
    interval: ProductItemInterval.Month,
  };

  return item;
};
