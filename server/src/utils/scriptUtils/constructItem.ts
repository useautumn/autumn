import { ProductItem, ProductItemInterval, UsageModel } from "@autumn/shared";

export const constructPrepaidItem = ({ featureId }: { featureId: string }) => {
  let item: ProductItem = {
    feature_id: featureId,
    usage_model: UsageModel.Prepaid,

    price: 100,
    billing_units: 100,

    interval: ProductItemInterval.Month,
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
